# Python CLI Development

This document covers Python-specific CLI development patterns using popular libraries.

## Library Overview

| Library | Best For | Style |
|---------|----------|-------|
| Click | Most projects | Decorator-based, batteries-included |
| Typer | Modern Python (3.6+) | Type hints, async support |
| Argparse | No dependencies | Built-in, verbose |

## Click

The most popular Python CLI library. Decorator-based with excellent help generation.

### Basic Example

```python
import click

@click.command()
@click.option('--name', prompt='Your name', help='Name of person')
@click.option('--count', default=1, help='Number of greetings')
def hello(name, count):
    """Simple program that greets NAME COUNT times."""
    for _ in range(count):
        click.echo(f'Hello {name}!')

if __name__ == '__main__':
    hello()
```

### Subcommands with Groups

```python
import click

@click.group()
@click.option('--debug/--no-debug', default=False)
@click.pass_context
def cli(ctx, debug):
    """Main CLI tool with subcommands."""
    ctx.ensure_object(dict)
    ctx.obj['DEBUG'] = debug

@cli.command()
@click.argument('name')
@click.option('--priority', '-p', default=5, type=click.IntRange(1, 10))
@click.pass_context
def add(ctx, name, priority):
    """Add a new item."""
    if ctx.obj['DEBUG']:
        click.echo(f"Debug: Adding {name}")
    click.echo(f"Added {name} with priority {priority}")

@cli.command()
@click.option('--format', '-f', type=click.Choice(['table', 'json', 'csv']),
              default='table', help='Output format')
def list(format):
    """List all items."""
    click.echo(f"Listing items in {format} format")

if __name__ == '__main__':
    cli()
```

### File Arguments

```python
import click

@click.command()
@click.argument('input', type=click.File('r'))
@click.argument('output', type=click.File('w'))
def process(input, output):
    """Process INPUT file and write to OUTPUT."""
    for line in input:
        output.write(line.upper())

# Also supports paths
@click.command()
@click.argument('path', type=click.Path(exists=True, dir_okay=False))
def validate(path):
    """Validate a file at PATH."""
    click.echo(f"Validating {path}")
```

### Progress and Colors

```python
import click
import time

@click.command()
def process():
    """Process with progress bar."""
    items = range(100)

    with click.progressbar(items, label='Processing') as bar:
        for item in bar:
            time.sleep(0.05)

    # Colored output
    click.secho('Success!', fg='green', bold=True)
    click.secho('Warning!', fg='yellow')
    click.secho('Error!', fg='red', err=True)
```

### Interactive Prompts

```python
import click

@click.command()
@click.option('--force', is_flag=True, help='Skip confirmations')
def delete(force):
    """Delete with confirmation."""
    if not force:
        if not click.confirm('Are you sure?'):
            click.echo('Cancelled')
            return

    # Password prompt (hidden input)
    password = click.prompt('Password', hide_input=True)

    # Choice prompt
    choice = click.prompt(
        'Choose option',
        type=click.Choice(['a', 'b', 'c']),
        default='a'
    )
```

### Testing with CliRunner

```python
from click.testing import CliRunner
from myapp.cli import main

def test_list_command():
    runner = CliRunner()
    result = runner.invoke(main, ['list', '--format', 'json'])

    assert result.exit_code == 0
    assert 'items' in result.output

def test_add_command():
    runner = CliRunner()
    result = runner.invoke(main, ['add', 'test-item', '--priority', '5'])

    assert result.exit_code == 0
    assert 'Added' in result.output

def test_file_input():
    runner = CliRunner()
    with runner.isolated_filesystem():
        with open('test.txt', 'w') as f:
            f.write('test content')

        result = runner.invoke(main, ['process', 'test.txt'])
        assert result.exit_code == 0
```

## Typer

Modern CLI library built on Click with type hints and async support.

### Basic Example

```python
import typer

app = typer.Typer()

@app.command()
def add(
    name: str,
    priority: int = typer.Option(5, min=1, max=10, help='Priority level')
):
    """Add a new item."""
    print(f"Added {name} with priority {priority}")

@app.command()
def list(
    format: str = typer.Option('table', '--format', '-f', help='Output format')
):
    """List all items."""
    print(f"Listing in {format} format")

if __name__ == "__main__":
    app()
```

### Subcommand Groups

```python
import typer

app = typer.Typer(help="Main CLI tool")
items_app = typer.Typer(help="Manage items")
config_app = typer.Typer(help="Manage configuration")

app.add_typer(items_app, name="items")
app.add_typer(config_app, name="config")

@items_app.command("add")
def items_add(name: str):
    """Add an item."""
    print(f"Added item: {name}")

@items_app.command("list")
def items_list():
    """List items."""
    print("Listing items...")

@config_app.command("show")
def config_show():
    """Show configuration."""
    print("Config: ...")
```

### Rich Integration

```python
import typer
from rich.console import Console
from rich.table import Table
from rich.progress import track
import time

console = Console()
app = typer.Typer()

@app.command()
def list():
    """List items in a rich table."""
    table = Table(title="Items")
    table.add_column("Name", style="cyan")
    table.add_column("Status", style="green")

    table.add_row("Item 1", "Active")
    table.add_row("Item 2", "Inactive")

    console.print(table)

@app.command()
def process():
    """Process with rich progress."""
    for i in track(range(100), description="Processing..."):
        time.sleep(0.05)
```

### Async Commands

```python
import typer
import asyncio

app = typer.Typer()

async def fetch_data(url: str) -> str:
    """Async data fetch."""
    await asyncio.sleep(1)  # Simulate network request
    return f"Data from {url}"

@app.command()
def fetch(url: str):
    """Fetch data from URL."""
    result = asyncio.run(fetch_data(url))
    print(result)
```

## Argparse

Built-in to Python. More verbose but no dependencies.

### Basic Example

```python
import argparse

def main():
    parser = argparse.ArgumentParser(
        description='Process some integers',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  %(prog)s add "My Item"
  %(prog)s list --format json
        '''
    )

    parser.add_argument('--version', action='version', version='%(prog)s 1.0.0')
    parser.add_argument('-v', '--verbose', action='store_true', help='Verbose output')

    subparsers = parser.add_subparsers(dest='command', help='Commands')

    # Add command
    add_parser = subparsers.add_parser('add', help='Add a new item')
    add_parser.add_argument('name', help='Item name')
    add_parser.add_argument('--priority', '-p', type=int, default=5,
                           choices=range(1, 11), help='Priority (1-10)')

    # List command
    list_parser = subparsers.add_parser('list', help='List all items')
    list_parser.add_argument('--format', '-f', choices=['table', 'json', 'csv'],
                            default='table', help='Output format')

    args = parser.parse_args()

    if args.command == 'add':
        print(f"Added {args.name} with priority {args.priority}")
    elif args.command == 'list':
        print(f"Listing in {args.format} format")

if __name__ == '__main__':
    main()
```

### Custom Types and Actions

```python
import argparse

def positive_int(value):
    """Custom type for positive integers."""
    ivalue = int(value)
    if ivalue <= 0:
        raise argparse.ArgumentTypeError(f"{value} is not a positive integer")
    return ivalue

def key_value_pair(value):
    """Parse key=value pairs."""
    if '=' not in value:
        raise argparse.ArgumentTypeError(f"'{value}' is not a key=value pair")
    return value.split('=', 1)

class EnvDefault(argparse.Action):
    """Action that uses environment variable as default."""
    def __init__(self, envvar, required=True, default=None, **kwargs):
        import os
        if envvar and envvar in os.environ:
            default = os.environ[envvar]
        if required and default:
            required = False
        super().__init__(default=default, required=required, **kwargs)

    def __call__(self, parser, namespace, values, option_string=None):
        setattr(namespace, self.dest, values)

parser = argparse.ArgumentParser()
parser.add_argument('--count', type=positive_int, help='Positive count')
parser.add_argument('--config', nargs='+', type=key_value_pair, help='key=value pairs')
parser.add_argument('--api-key', action=EnvDefault, envvar='API_KEY', help='API key')
```

## Configuration Loading Pattern

Pattern for loading configuration with proper precedence across all libraries:

```python
import os
from pathlib import Path
import yaml

def load_config(cli_args: dict) -> dict:
    """
    Load configuration with proper precedence:
    1. CLI arguments (highest)
    2. Environment variables
    3. Config file
    4. Defaults (lowest)
    """
    # Built-in defaults
    config = {
        'debug': False,
        'timeout': 30,
        'color': True,
        'format': 'table'
    }

    # Load from config file
    config_paths = [
        Path.home() / '.config' / 'myapp' / 'config.yaml',
        Path('.myapp.yaml'),  # Current directory
    ]

    for config_path in config_paths:
        if config_path.exists():
            with open(config_path) as f:
                file_config = yaml.safe_load(f) or {}
                config.update(file_config)
            break

    # Environment variable mappings
    env_mappings = {
        'MYAPP_DEBUG': ('debug', lambda x: x.lower() == 'true'),
        'MYAPP_TIMEOUT': ('timeout', int),
        'MYAPP_COLOR': ('color', lambda x: x.lower() == 'true'),
        'MYAPP_FORMAT': ('format', str),
    }

    for env_var, (key, converter) in env_mappings.items():
        if env_var in os.environ:
            config[key] = converter(os.environ[env_var])

    # CLI arguments override all (filter out None values)
    config.update({k: v for k, v in cli_args.items() if v is not None})

    return config
```

## Error Handling Pattern

```python
import sys
import traceback
import click

class CliError(Exception):
    """Base CLI error with exit code."""
    exit_code = 1

class ValidationError(CliError):
    """Input validation error."""
    exit_code = 2

class NotFoundError(CliError):
    """Resource not found."""
    exit_code = 66

def cli_error_handler(debug: bool = False):
    """Decorator for CLI error handling."""
    def decorator(func):
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except CliError as e:
                click.echo(f"Error: {e}", err=True)
                sys.exit(e.exit_code)
            except Exception as e:
                if debug:
                    traceback.print_exc()
                else:
                    click.echo(f"Error: {e}", err=True)
                    click.echo("Use --debug for details", err=True)
                sys.exit(1)
        return wrapper
    return decorator

# Usage
@click.command()
@click.option('--debug', is_flag=True)
@cli_error_handler(debug=True)
def main(debug):
    """Main command."""
    pass
```

## Output Formatting Pattern

```python
import json
import csv
import io
from typing import List, Dict, Any

def format_output(data: List[Dict[str, Any]], format: str) -> str:
    """Format data for output."""
    if format == 'json':
        return json.dumps(data, indent=2, default=str)

    elif format == 'csv':
        if not data:
            return ''
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
        return output.getvalue()

    elif format == 'yaml':
        import yaml
        return yaml.dump(data, default_flow_style=False)

    else:  # table
        return format_table(data)

def format_table(data: List[Dict[str, Any]]) -> str:
    """Format data as ASCII table."""
    if not data:
        return 'No items found.'

    headers = list(data[0].keys())
    widths = {h: len(h) for h in headers}

    for row in data:
        for h in headers:
            widths[h] = max(widths[h], len(str(row.get(h, ''))))

    # Header
    header_line = '  '.join(h.ljust(widths[h]) for h in headers)
    separator = '  '.join('-' * widths[h] for h in headers)

    lines = [header_line, separator]

    # Rows
    for row in data:
        line = '  '.join(str(row.get(h, '')).ljust(widths[h]) for h in headers)
        lines.append(line)

    return '\n'.join(lines)
```

## See Also

- [CLI Development Guidelines](../cli-development.md) - Core principles and patterns
- [Node.js CLI Patterns](nodejs-cli.md)
- [Go CLI Patterns](go-cli.md)
- [Rust CLI Patterns](rust-cli.md)
