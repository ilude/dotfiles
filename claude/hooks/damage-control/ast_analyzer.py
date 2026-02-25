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
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Any, List, Optional

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

    def _extract_all_commands(self, root: Any, _depth: int = 0) -> List[str]:
        """Walk the full AST and collect text for every command node.

        Extracts commands from all nested contexts:
        - command_substitution: $(rm -rf /)
        - subshell: (rm -rf /)
        - pipeline: echo hello | rm -rf /
        - heredoc_body, function bodies, if/while/for, compound statements
        - shell -c '...' invocations (re-parsed recursively)

        Quote stripping: command name tokens like ``'rm'`` have surrounding
        quotes stripped so regex patterns like ``\\brm\\b`` match correctly.
        """
        if _depth > 3:
            return []

        commands: List[str] = []

        def walk(node: Any) -> None:
            if node.type == "command" and node.children:
                # Strip surrounding quotes from the command name token.
                cmd_name_raw = self._node_text(node.children[0]).strip()
                cmd_name = self._strip_quotes(cmd_name_raw)

                # Reconstruct command string with unquoted command name.
                parts = [cmd_name]
                for child in node.children[1:]:
                    child_text = self._node_text(child).strip()
                    if child_text:
                        parts.append(child_text)
                if parts:
                    commands.append(" ".join(parts))

                # Special case: shell -c 'inner' — re-parse the string argument.
                if cmd_name in self._SHELL_C_NAMES:
                    args = [
                        self._node_text(c).strip()
                        for c in node.children[1:]
                        if self._node_text(c).strip()
                    ]
                    # Find -c flag then take next token as the inner script.
                    for i, arg in enumerate(args):
                        if arg == "-c" and i + 1 < len(args):
                            inner = self._strip_quotes(args[i + 1])
                            if inner:
                                try:
                                    parser = self._get_parser()
                                    inner_tree = parser.parse(inner.encode("utf-8"))
                                    commands.extend(
                                        self._extract_all_commands(
                                            inner_tree.root_node, _depth + 1
                                        )
                                    )
                                except Exception:
                                    pass
                            break

            for child in node.children:
                walk(child)

        walk(root)
        return commands

    def _check_extracted_commands(
        self, commands: List[str], compiled_patterns: List[Any]
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

    def _get_compiled_patterns(self, config: dict) -> List[Any]:
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

    def _check_variable_expansion(self, root: Any, config: dict) -> Optional[dict]:
        """Check for variable expansion in dangerous commands.

        Returns {"decision": "ask", "reason": "..."} if unsafe variables found,
        or None to allow further analysis.
        """
        dangerous_commands = config.get("dangerousCommands", [])
        if not dangerous_commands:
            return None

        def check_command_arguments(node: Any) -> Optional[dict]:
            if node.type != "command":
                return None

            if not node.children:
                return None

            cmd_name_node = node.children[0]
            cmd_name = self._node_text(cmd_name_node).strip()

            if cmd_name not in dangerous_commands:
                return None

            all_variables: set = set()
            for child in node.children[1:]:
                variables = self._extract_variables_from_node(child)
                all_variables.update(variables)

            if all_variables and self._has_unsafe_variable(all_variables):
                return {
                    "decision": "ask",
                    "reason": f"Variable expansion in {cmd_name} arguments: {', '.join(sorted(all_variables))}",
                }

            return None

        def walk(node: Any) -> Optional[dict]:
            result = check_command_arguments(node)
            if result:
                return result

            for child in node.children:
                result = walk(child)
                if result:
                    return result

            return None

        return walk(root)

    def _check_eval_source(
        self, root: Any, config: dict, compiled_patterns: List[Any], depth: int = 0
    ) -> Optional[dict]:
        """Detect eval/source commands and recursively analyse their arguments.

        Rules:
        - eval 'string'  → recursively parse string content, apply full analysis
        - eval $VAR      → ask (dynamic argument, value unknown)
        - source /path   → allow (static path, no dynamic content)
        - source $VAR    → ask (dynamic path, value unknown)
        - .  /path       → allow (static dot-source)
        - .  $VAR        → ask (dynamic dot-source)

        Depth limit of 3 prevents infinite recursion on pathological inputs.
        """
        if depth > 3:
            return None

        _EVAL_SOURCE_CMDS = {"eval", "source", "."}

        def check_node(node: Any) -> Optional[dict]:
            if node.type != "command":
                return None
            if not node.children:
                return None

            cmd_name = self._node_text(node.children[0]).strip()
            if cmd_name not in _EVAL_SOURCE_CMDS:
                return None

            # Gather argument nodes (skip the command name itself)
            arg_nodes = node.children[1:]
            if not arg_nodes:
                return None

            for arg in arg_nodes:
                arg_type = arg.type
                # Variable expansion in argument → ask
                if arg_type in ("expansion", "simple_expansion"):
                    var_name = self._node_text(arg)
                    return {
                        "decision": "ask",
                        "reason": f"{cmd_name} with dynamic argument {var_name} — value unknown at analysis time",
                    }

                # Check for variable expansions embedded inside the argument
                embedded_vars = self._extract_variables_from_node(arg)
                if embedded_vars and self._has_unsafe_variable(embedded_vars):
                    return {
                        "decision": "ask",
                        "reason": f"{cmd_name} with dynamic argument containing {', '.join(sorted(embedded_vars))}",
                    }

                # String literal argument for eval → recursively analyse content
                if cmd_name == "eval" and arg_type in (
                    "string",
                    "raw_string",
                    "word",
                ):
                    inner_text = self._node_text(arg).strip("'\"")
                    if inner_text:
                        try:
                            parser = self._get_parser()
                            inner_tree = parser.parse(inner_text.encode("utf-8"))
                            inner_root = inner_tree.root_node

                            # Re-apply all passes to inner content
                            if compiled_patterns:
                                inner_cmds = self._extract_all_commands(inner_root)
                                result = self._check_extracted_commands(
                                    inner_cmds, compiled_patterns
                                )
                                if result:
                                    return result

                            result = self._check_eval_source(
                                inner_root, config, compiled_patterns, depth + 1
                            )
                            if result:
                                return result
                        except Exception:
                            pass

            return None

        def walk(node: Any) -> Optional[dict]:
            result = check_node(node)
            if result:
                return result
            for child in node.children:
                result = walk(child)
                if result:
                    return result
            return None

        return walk(root)

    def analyze_command_ast(self, command: str, config: dict) -> dict:
        """Analyze a bash command string via tree-sitter AST.

        Veto-only: returns allow by default. Analysis passes may escalate to
        ask or block; they will never downgrade an existing block.

        Args:
            command: The bash command string to analyze.
            config: The full damage-control config dict. Reads the
                    ``astAnalysis`` section for settings:
                    - enabled (bool): skip if False
                    - safeCommands (list): fast-path — skip AST for these
                    - dangerousCommands (list): extra scrutiny candidates
                    - timeoutMs (int): max ms for AST analysis

        Returns:
            {"decision": "allow|ask|block", ...}
        """
        ast_config = config.get("astAnalysis", {})

        if not ast_config.get("enabled", True):
            return {"decision": "allow"}

        if not self.is_available():
            return {"decision": "allow"}

        # Fast path: skip AST for explicitly safe commands.
        safe_commands = ast_config.get("safeCommands", [])
        if safe_commands:
            cmd_name = command.strip().split()[0] if command.strip() else ""
            if cmd_name in safe_commands:
                return {"decision": "allow"}

        timeout_ms = ast_config.get("timeoutMs", 0)
        timeout_sec = timeout_ms / 1000.0 if timeout_ms and timeout_ms > 0 else None

        def _run_analysis() -> dict:
            parser = self._get_parser()
            tree = parser.parse(command.encode("utf-8"))
            root = tree.root_node

            compiled_patterns = self._get_compiled_patterns(config)

            # Pass 1: deep command extraction.
            if compiled_patterns:
                extracted = self._extract_all_commands(root)
                r = self._check_extracted_commands(extracted, compiled_patterns)
                if r:
                    return r

            # Pass 2: variable expansion in dangerous commands.
            r = self._check_variable_expansion(root, ast_config)
            if r:
                return r

            # Pass 3: eval/source with recursive parsing.
            r = self._check_eval_source(root, config, compiled_patterns)
            if r:
                return r

            return {"decision": "allow"}

        try:
            if timeout_sec is not None:
                with ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(_run_analysis)
                    return future.result(timeout=timeout_sec)
            else:
                return _run_analysis()
        except FuturesTimeoutError:
            # Timeout — fall through gracefully.
            return {"decision": "allow"}
        except Exception:
            # Parse errors or missing tree-sitter — fall through gracefully.
            return {"decision": "allow"}
