# /// script
# requires-python = ">=3.8"
# dependencies = ["tree-sitter>=0.23.0", "tree-sitter-bash>=0.23.0", "pyyaml"]
# ///
"""
AST Analyzer - Tree-sitter bash AST analysis for damage-control hooks.

Provides a veto-only second pass on bash commands using tree-sitter parsing.
AST analysis may escalate allow→ask|block but never downgrades block→allow.

Decision contract:
  {"decision": "allow"}  - No objection; caller's decision stands
  {"decision": "ask", "reason": "..."}   - Escalate to ask
  {"decision": "block", "reason": "..."}  - Escalate to block
"""

import re
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from typing import Any, Optional

_TREE_SITTER_AVAILABLE: Optional[bool] = None

# Safe variables that don't require escalation
SAFE_VARIABLES = {
    "$HOME",
    "$PWD",
    "$USER",
    "$PATH",
    "$SHELL",
    "$TERM",
}

# Node types that contain nested commands to extract
_NESTED_COMMAND_TYPES = {
    "command_substitution",
    "subshell",
    "pipeline",
    "heredoc_body",
    "function_definition",
    "compound_statement",
    "if_statement",
    "while_statement",
    "for_statement",
    "do_group",
    "list",
}


def _check_tree_sitter() -> bool:
    """Check whether tree-sitter and tree-sitter-bash are importable."""
    try:
        import tree_sitter  # noqa: F401
        import tree_sitter_bash  # noqa: F401

        return True
    except ImportError:
        return False


class ASTAnalyzer:
    """Tree-sitter bash AST analyzer — veto-only second pass.

    Lazy initialization: the tree-sitter parser is created on first use,
    not at import time, so importing this module has no cost when tree-sitter
    is unavailable or AST analysis is disabled.
    """

    def __init__(self) -> None:
        self._parser: Any = None

    def is_available(self) -> bool:
        """Return True if tree-sitter and tree-sitter-bash are importable."""
        global _TREE_SITTER_AVAILABLE
        if _TREE_SITTER_AVAILABLE is None:
            _TREE_SITTER_AVAILABLE = _check_tree_sitter()
        return _TREE_SITTER_AVAILABLE

    def _get_parser(self) -> Any:
        """Return the tree-sitter parser, creating it on first call."""
        if self._parser is not None:
            return self._parser

        import tree_sitter_bash
        from tree_sitter import Language, Parser

        bash_language = Language(tree_sitter_bash.language())
        self._parser = Parser(bash_language)
        return self._parser

    def _node_text(self, node: Any) -> str:
        """Decode node text to str."""
        text = node.text
        return text.decode("utf-8") if isinstance(text, bytes) else str(text)

    _SHELL_C_NAMES = {"bash", "sh", "zsh", "ksh", "dash"}

    def _strip_quotes(self, text: str) -> str:
        """Strip surrounding single or double quotes from a token."""
        if len(text) >= 2 and text[0] == text[-1] and text[0] in ('"', "'"):
            return text[1:-1]
        return text

    def _recurse_shell_c(self, node: Any, commands: list, depth: int) -> None:
        """Re-parse the argument after -c in a shell invocation."""
        args = [self._node_text(c).strip() for c in node.children[1:] if self._node_text(c).strip()]
        for i, arg in enumerate(args):
            if arg == "-c" and i + 1 < len(args):
                inner = self._strip_quotes(args[i + 1])
                if inner:
                    try:
                        inner_tree = self._get_parser().parse(inner.encode("utf-8"))
                        commands.extend(self._extract_all_commands(inner_tree.root_node, depth + 1))
                    except Exception:
                        pass
                break

    def _collect_command_node(self, node: Any, commands: list, depth: int) -> None:
        """Extract command text from a command node and recurse into shell -c args."""
        cmd_name = self._strip_quotes(self._node_text(node.children[0]).strip())
        parts = [cmd_name] + [
            self._node_text(c).strip() for c in node.children[1:] if self._node_text(c).strip()
        ]
        if parts:
            commands.append(" ".join(parts))
        if cmd_name in self._SHELL_C_NAMES:
            self._recurse_shell_c(node, commands, depth)

    def _walk_commands(self, node: Any, commands: list, depth: int) -> None:
        """Recursively collect command strings into commands list."""
        if node.type == "command" and node.children:
            self._collect_command_node(node, commands, depth)
        for child in node.children:
            self._walk_commands(child, commands, depth)

    def _extract_all_commands(self, root: Any, _depth: int = 0) -> list[str]:
        """Walk the full AST and collect text for every command node."""
        if _depth > 3:
            return []
        commands: list[str] = []
        self._walk_commands(root, commands, _depth)
        return commands

    def _check_extracted_commands(
        self, commands: list[str], compiled_patterns: list[Any]
    ) -> Optional[dict]:
        """Run a list of extracted command strings through compiled regex patterns.

        Returns a block/ask decision if any pattern matches, else None.
        """
        for cmd in commands:
            for item in compiled_patterns:
                compiled_regex = item.get("compiled")
                if not compiled_regex:
                    continue
                try:
                    if compiled_regex.search(cmd):
                        reason = item.get("reason", "Blocked by AST pattern extraction")
                        should_ask = item.get("ask", False)
                        if should_ask:
                            return {"decision": "ask", "reason": reason}
                        else:
                            return {"decision": "block", "reason": reason}
                except re.error:
                    continue
        return None

    def _get_compiled_patterns(self, config: dict) -> list[Any]:
        """Return compiled bash tool patterns from config.

        Prefers already-compiled patterns (bashToolPatterns_compiled) for
        performance, falls back to compiling raw patterns on the fly.
        """
        if "bashToolPatterns_compiled" in config:
            return config["bashToolPatterns_compiled"]

        # Compile on the fly (test / backward-compat path)
        raw = config.get("bashToolPatterns", [])
        compiled = []
        for item in raw:
            pattern = item.get("pattern", "")
            if not pattern:
                continue
            try:
                compiled_regex = re.compile(pattern, re.IGNORECASE)
                entry = item.copy()
                entry["compiled"] = compiled_regex
                compiled.append(entry)
            except re.error:
                continue
        return compiled

    def _extract_variables_from_node(self, node: Any) -> set:
        """Extract all variable references from an AST node and its children.

        Returns a set of variable names (e.g., {"$VAR", "$HOME"}).
        """
        variables = set()

        def walk(n: Any) -> None:
            if n.type in ("expansion", "simple_expansion"):
                var_text = self._node_text(n)
                variables.add(var_text)

            for child in n.children:
                walk(child)

        walk(node)
        return variables

    def _has_unsafe_variable(self, variables: set) -> bool:
        """Check if any variable in the set is NOT in the safe list."""
        for var in variables:
            if var not in SAFE_VARIABLES:
                return True
        return False

    def _check_command_var_expansion(self, node: Any, dangerous_commands: list) -> Optional[dict]:
        """Check a single command node for unsafe variable expansion."""
        if node.type != "command" or not node.children:
            return None
        cmd_name = self._node_text(node.children[0]).strip()
        if cmd_name not in dangerous_commands:
            return None
        all_variables: set = set()
        for child in node.children[1:]:
            all_variables.update(self._extract_variables_from_node(child))
        if all_variables and self._has_unsafe_variable(all_variables):
            return {
                "decision": "ask",
                "reason": (
                    f"Variable expansion in {cmd_name} arguments: "
                    f"{', '.join(sorted(all_variables))}"
                ),
            }
        return None

    def _walk_var_expansion(self, node: Any, dangerous_commands: list) -> Optional[dict]:
        """Recursively walk AST checking for unsafe variable expansion."""
        result = self._check_command_var_expansion(node, dangerous_commands)
        if result:
            return result
        for child in node.children:
            result = self._walk_var_expansion(child, dangerous_commands)
            if result:
                return result
        return None

    def _check_variable_expansion(self, root: Any, config: dict) -> Optional[dict]:
        """Check for variable expansion in dangerous commands."""
        dangerous_commands = config.get("dangerousCommands", [])
        if not dangerous_commands:
            return None
        return self._walk_var_expansion(root, dangerous_commands)

    _EVAL_SOURCE_CMDS = {"eval", "source", "."}

    def _check_arg_for_eval_source(
        self, cmd_name: str, arg: Any, compiled_patterns: list, config: dict, depth: int
    ) -> Optional[dict]:
        """Check a single argument node of an eval/source command."""
        arg_type = arg.type
        if arg_type in ("expansion", "simple_expansion"):
            return {
                "decision": "ask",
                "reason": (
                    f"{cmd_name} with dynamic argument {self._node_text(arg)}"
                    " \u2014 value unknown at analysis time"
                ),
            }
        embedded_vars = self._extract_variables_from_node(arg)
        if embedded_vars and self._has_unsafe_variable(embedded_vars):
            return {
                "decision": "ask",
                "reason": (
                    f"{cmd_name} with dynamic argument containing "
                    f"{', '.join(sorted(embedded_vars))}"
                ),
            }
        if cmd_name == "eval" and arg_type in ("string", "raw_string", "word"):
            return self._recurse_eval_literal(arg, compiled_patterns, config, depth)
        return None

    def _recurse_eval_literal(
        self, arg: Any, compiled_patterns: list, config: dict, depth: int
    ) -> Optional[dict]:
        """Re-parse and analyse a string literal passed to eval."""
        inner_text = self._node_text(arg).strip("'\"")
        if not inner_text:
            return None
        try:
            inner_root = self._get_parser().parse(inner_text.encode("utf-8")).root_node
            if compiled_patterns:
                result = self._check_extracted_commands(
                    self._extract_all_commands(inner_root), compiled_patterns
                )
                if result:
                    return result
            return self._check_eval_source(inner_root, config, compiled_patterns, depth + 1)
        except Exception:
            return None

    def _check_eval_source_node(
        self, node: Any, compiled_patterns: list, config: dict, depth: int
    ) -> Optional[dict]:
        """Check a single AST node for eval/source patterns."""
        if node.type != "command" or not node.children:
            return None
        cmd_name = self._node_text(node.children[0]).strip()
        if cmd_name not in self._EVAL_SOURCE_CMDS:
            return None
        arg_nodes = node.children[1:]
        if not arg_nodes:
            return None
        for arg in arg_nodes:
            result = self._check_arg_for_eval_source(
                cmd_name, arg, compiled_patterns, config, depth
            )
            if result:
                return result
        return None

    def _walk_eval_source(
        self, node: Any, compiled_patterns: list, config: dict, depth: int
    ) -> Optional[dict]:
        """Recursively walk AST checking for eval/source patterns."""
        result = self._check_eval_source_node(node, compiled_patterns, config, depth)
        if result:
            return result
        for child in node.children:
            result = self._walk_eval_source(child, compiled_patterns, config, depth)
            if result:
                return result
        return None

    def _check_eval_source(
        self, root: Any, config: dict, compiled_patterns: list[Any], depth: int = 0
    ) -> Optional[dict]:
        """Detect eval/source commands and recursively analyse their arguments.

        Depth limit of 3 prevents infinite recursion on pathological inputs.
        """
        if depth > 3:
            return None
        return self._walk_eval_source(root, compiled_patterns, config, depth)

    def _run_analysis(self, command: str, config: dict) -> dict:
        """Execute the three AST analysis passes and return a decision."""
        root = self._get_parser().parse(command.encode("utf-8")).root_node
        compiled_patterns = self._get_compiled_patterns(config)
        if compiled_patterns:
            r = self._check_extracted_commands(self._extract_all_commands(root), compiled_patterns)
            if r:
                return r
        r = self._check_variable_expansion(root, config.get("astAnalysis", {}))
        if r:
            return r
        r = self._check_eval_source(root, config, compiled_patterns)
        if r:
            return r
        return {"decision": "allow"}

    def _is_safe_command(self, command: str, safe_commands: list) -> bool:
        """Return True if the command name is in the safe-command fast-path list."""
        if not safe_commands:
            return False
        cmd_name = command.strip().split()[0] if command.strip() else ""
        return cmd_name in safe_commands

    def _run_with_timeout(self, command: str, config: dict, timeout_sec: float) -> dict:
        """Run analysis in a thread with a timeout, escalating to ask on timeout/error."""
        try:
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(self._run_analysis, command, config)
                return future.result(timeout=timeout_sec)
        except FuturesTimeoutError:
            return {"decision": "ask", "reason": "Command too complex to analyze within timeout"}
        except Exception:
            return {"decision": "ask", "reason": "AST analysis error — confirm command is safe"}

    def _get_timeout_sec(self, ast_config: dict) -> Optional[float]:
        """Return timeout in seconds from config, or None if not set."""
        timeout_ms = ast_config.get("timeoutMs", 0)
        if timeout_ms and timeout_ms > 0:
            return timeout_ms / 1000.0
        return None

    def analyze_command_ast(self, command: str, config: dict) -> dict:
        """Analyze a bash command string via tree-sitter AST (veto-only)."""
        ast_config = config.get("astAnalysis", {})
        if not ast_config.get("enabled", True) or not self.is_available():
            return {"decision": "allow"}
        if self._is_safe_command(command, ast_config.get("safeCommands", [])):
            return {"decision": "allow"}
        timeout_sec = self._get_timeout_sec(ast_config)
        if timeout_sec is not None:
            return self._run_with_timeout(command, config, timeout_sec)
        try:
            return self._run_analysis(command, config)
        except Exception:
            return {"decision": "allow"}
