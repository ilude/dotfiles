---
name: cli-development/nodejs-cli
description: Node.js CLI development patterns with Commander, Yargs, and Oclif.
---

# Node.js CLI Development

This document covers Node.js-specific CLI development patterns using popular libraries.

## Library Overview

| Library | Best For | Style |
|---------|----------|-------|
| Commander | Simple to medium CLIs | Fluent API, minimal |
| Yargs | Feature-rich CLIs | Declarative, batteries-included |
| Oclif | Complex enterprise CLIs | Framework, TypeScript-first |

## Commander

Minimal and clean API. Good for most projects.

### Basic Example

```javascript
const { Command } = require('commander');

const program = new Command();

program
  .name('tool')
  .description('A tool that does one thing well')
  .version('1.0.0');

program
  .command('add <name>')
  .description('Add a new item')
  .option('-p, --priority <number>', 'Item priority', '5')
  .option('--tags <items>', 'Comma-separated tags', (val) => val.split(','))
  .action((name, options) => {
    console.log(`Added ${name} with priority ${options.priority}`);
    if (options.tags) {
      console.log(`Tags: ${options.tags.join(', ')}`);
    }
  });

program
  .command('list')
  .description('List all items')
  .option('-f, --format <type>', 'Output format', 'table')
  .action((options) => {
    console.log(`Listing items in ${options.format} format`);
  });

program.parse(process.argv);
```

### Global Options

```javascript
const { Command } = require('commander');

const program = new Command();

program
  .option('-v, --verbose', 'Verbose output')
  .option('--debug', 'Debug mode')
  .hook('preAction', (thisCommand, actionCommand) => {
    const opts = thisCommand.opts();
    if (opts.debug) {
      console.log('Debug mode enabled');
    }
  });

program
  .command('run')
  .action(() => {
    const opts = program.opts();
    if (opts.verbose) {
      console.log('Verbose: Starting run...');
    }
    console.log('Running...');
  });
```

### Custom Argument Processing

```javascript
const { Command, InvalidArgumentError } = require('commander');

function parseIntRange(value, min, max) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new InvalidArgumentError('Not a number.');
  }
  if (parsed < min || parsed > max) {
    throw new InvalidArgumentError(`Must be between ${min} and ${max}.`);
  }
  return parsed;
}

program
  .command('set-priority <value>')
  .description('Set priority (1-10)')
  .action((value) => {
    const priority = parseIntRange(value, 1, 10);
    console.log(`Priority set to ${priority}`);
  });
```

### Async Actions

```javascript
const { Command } = require('commander');

const program = new Command();

program
  .command('fetch <url>')
  .description('Fetch data from URL')
  .action(async (url) => {
    try {
      const response = await fetch(url);
      const data = await response.json();
      console.log(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Handle unhandled rejections
program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
```

## Yargs

Feature-rich with excellent help generation and validation.

### Basic Example

```javascript
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

yargs(hideBin(process.argv))
  .scriptName('tool')
  .usage('$0 <command> [options]')
  .command('add <name>', 'Add a new item', (yargs) => {
    return yargs
      .positional('name', {
        describe: 'Item name',
        type: 'string'
      })
      .option('priority', {
        alias: 'p',
        type: 'number',
        default: 5,
        describe: 'Priority level (1-10)'
      });
  }, (argv) => {
    console.log(`Added ${argv.name} with priority ${argv.priority}`);
  })
  .command('list', 'List all items', (yargs) => {
    return yargs.option('format', {
      alias: 'f',
      choices: ['table', 'json', 'csv'],
      default: 'table',
      describe: 'Output format'
    });
  }, (argv) => {
    console.log(`Listing items in ${argv.format} format`);
  })
  .demandCommand(1, 'You need to specify a command')
  .strict()
  .help()
  .argv;
```

### Middleware and Global Options

```javascript
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const debugMiddleware = (argv) => {
  if (argv.debug) {
    console.log('Arguments:', argv);
  }
};

yargs(hideBin(process.argv))
  .option('debug', {
    type: 'boolean',
    default: false,
    global: true,
    describe: 'Enable debug mode'
  })
  .option('config', {
    alias: 'c',
    type: 'string',
    global: true,
    describe: 'Path to config file'
  })
  .middleware([debugMiddleware])
  .command('run', 'Run the application', {}, (argv) => {
    console.log('Running...');
  })
  .argv;
```

### Validation and Coercion

```javascript
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

yargs(hideBin(process.argv))
  .command('set <key> <value>', 'Set a configuration value', (yargs) => {
    return yargs
      .positional('key', {
        type: 'string',
        describe: 'Configuration key'
      })
      .positional('value', {
        type: 'string',
        describe: 'Configuration value'
      })
      .option('type', {
        choices: ['string', 'number', 'boolean'],
        default: 'string'
      })
      .coerce('value', (value, argv) => {
        // Coerce value based on type
        if (argv.type === 'number') return Number(value);
        if (argv.type === 'boolean') return value === 'true';
        return value;
      })
      .check((argv) => {
        if (argv.type === 'number' && isNaN(argv.value)) {
          throw new Error('Value must be a valid number');
        }
        return true;
      });
  }, (argv) => {
    console.log(`Set ${argv.key} = ${argv.value} (${typeof argv.value})`);
  })
  .argv;
```

### Config File Support

```javascript
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

yargs(hideBin(process.argv))
  .config('config', 'Path to JSON config file', (configPath) => {
    const fs = require('fs');
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  })
  .env('MYAPP')  // Load MYAPP_* environment variables
  .pkgConf('myapp')  // Load from package.json "myapp" key
  .default({
    timeout: 30,
    color: true
  })
  .argv;
```

## Oclif

Full-featured framework for complex, enterprise CLIs. TypeScript-first.

### Project Structure

```
my-cli/
  src/
    commands/
      add.ts
      list.ts
      config/
        show.ts
        set.ts
    hooks/
      init.ts
    lib/
      utils.ts
  package.json
  tsconfig.json
```

### Basic Command

```typescript
import { Command, Flags, Args } from '@oclif/core';

export default class Add extends Command {
  static description = 'Add a new item';

  static examples = [
    '<%= config.bin %> add "My Item"',
    '<%= config.bin %> add "My Item" --priority 5',
  ];

  static flags = {
    priority: Flags.integer({
      char: 'p',
      description: 'Priority level',
      default: 5,
      min: 1,
      max: 10,
    }),
    tags: Flags.string({
      char: 't',
      description: 'Comma-separated tags',
      multiple: true,
    }),
  };

  static args = {
    name: Args.string({
      description: 'Item name',
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Add);

    this.log(`Added ${args.name} with priority ${flags.priority}`);

    if (flags.tags) {
      this.log(`Tags: ${flags.tags.join(', ')}`);
    }
  }
}
```

### Nested Commands

```typescript
// src/commands/config/show.ts
import { Command } from '@oclif/core';

export default class ConfigShow extends Command {
  static description = 'Show configuration';

  async run(): Promise<void> {
    this.log('Configuration:');
    this.log(JSON.stringify(this.config, null, 2));
  }
}

// src/commands/config/set.ts
import { Command, Args, Flags } from '@oclif/core';

export default class ConfigSet extends Command {
  static description = 'Set a configuration value';

  static args = {
    key: Args.string({ required: true }),
    value: Args.string({ required: true }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ConfigSet);
    this.log(`Set ${args.key} = ${args.value}`);
  }
}
```

### Hooks

```typescript
// src/hooks/init.ts
import { Hook } from '@oclif/core';

const hook: Hook<'init'> = async function (opts) {
  // Run before every command
  if (process.env.DEBUG) {
    this.log(`Running command: ${opts.id}`);
  }
};

export default hook;
```

### Custom Base Command

```typescript
// src/lib/base-command.ts
import { Command, Flags } from '@oclif/core';

export abstract class BaseCommand extends Command {
  static baseFlags = {
    verbose: Flags.boolean({
      char: 'v',
      description: 'Verbose output',
    }),
    format: Flags.string({
      char: 'f',
      options: ['table', 'json', 'csv'],
      default: 'table',
    }),
  };

  protected verbose = false;
  protected format = 'table';

  async init(): Promise<void> {
    const { flags } = await this.parse(this.constructor as any);
    this.verbose = flags.verbose;
    this.format = flags.format;
  }

  protected output(data: any): void {
    switch (this.format) {
      case 'json':
        this.log(JSON.stringify(data, null, 2));
        break;
      case 'csv':
        // CSV formatting
        break;
      default:
        // Table formatting
        break;
    }
  }
}

// Usage in command
import { BaseCommand } from '../lib/base-command';

export default class List extends BaseCommand {
  static flags = {
    ...BaseCommand.baseFlags,
    status: Flags.string({ options: ['active', 'inactive'] }),
  };

  async run(): Promise<void> {
    const items = await getItems();
    this.output(items);
  }
}
```

## Common Utilities

### Color Output (chalk)

```javascript
const chalk = require('chalk');

// Basic colors
console.log(chalk.green('Success!'));
console.log(chalk.red('Error!'));
console.log(chalk.yellow('Warning!'));

// Styles
console.log(chalk.bold('Bold text'));
console.log(chalk.dim('Dimmed text'));
console.log(chalk.underline('Underlined'));

// Combinations
console.log(chalk.bold.red('Bold red error'));
console.log(chalk.bgRed.white('White on red'));

// Conditional coloring
const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;
const log = supportsColor ? chalk.green : (s) => s;
console.log(log('Conditionally colored'));
```

### Progress Indicators (ora)

```javascript
const ora = require('ora');

async function fetchData() {
  const spinner = ora('Fetching data...').start();

  try {
    const data = await fetch('https://api.example.com/data');
    spinner.succeed('Data fetched successfully');
    return data;
  } catch (error) {
    spinner.fail('Failed to fetch data');
    throw error;
  }
}

// With updates
const spinner = ora('Processing').start();
spinner.text = 'Processing file 1/10';
// ...
spinner.text = 'Processing file 2/10';
```

### Interactive Prompts (inquirer)

```javascript
const inquirer = require('inquirer');

async function getUserInput() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'What is your name?',
      validate: (input) => input.length > 0 || 'Name is required',
    },
    {
      type: 'list',
      name: 'priority',
      message: 'Select priority:',
      choices: ['Low', 'Medium', 'High'],
    },
    {
      type: 'checkbox',
      name: 'features',
      message: 'Select features:',
      choices: ['Feature A', 'Feature B', 'Feature C'],
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Proceed?',
      default: true,
    },
  ]);

  return answers;
}
```

### Tables (cli-table3)

```javascript
const Table = require('cli-table3');

function displayTable(items) {
  const table = new Table({
    head: ['Name', 'Status', 'Priority'],
    colWidths: [30, 15, 10],
    style: {
      head: ['cyan'],
      border: ['grey'],
    },
  });

  items.forEach((item) => {
    table.push([item.name, item.status, item.priority]);
  });

  console.log(table.toString());
}
```

## Configuration Pattern

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');

function loadConfig(cliArgs = {}) {
  // Defaults
  const config = {
    debug: false,
    timeout: 30,
    color: true,
    format: 'table',
  };

  // Config file locations (in order of precedence)
  const configPaths = [
    path.join(os.homedir(), '.config', 'myapp', 'config.json'),
    path.join(os.homedir(), '.myapprc'),
    path.join(process.cwd(), '.myapprc'),
  ];

  // Load from config files
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        Object.assign(config, fileConfig);
      } catch (e) {
        console.warn(`Warning: Could not parse ${configPath}`);
      }
    }
  }

  // Environment variables (MYAPP_*)
  const envMappings = {
    MYAPP_DEBUG: ['debug', (v) => v === 'true'],
    MYAPP_TIMEOUT: ['timeout', parseInt],
    MYAPP_COLOR: ['color', (v) => v === 'true'],
    MYAPP_FORMAT: ['format', (v) => v],
  };

  for (const [envVar, [key, converter]] of Object.entries(envMappings)) {
    if (process.env[envVar] !== undefined) {
      config[key] = converter(process.env[envVar]);
    }
  }

  // CLI arguments (highest priority)
  for (const [key, value] of Object.entries(cliArgs)) {
    if (value !== undefined) {
      config[key] = value;
    }
  }

  return config;
}
```

## Error Handling Pattern

```javascript
class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
    this.name = 'CliError';
  }
}

class ValidationError extends CliError {
  constructor(message) {
    super(message, 2);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends CliError {
  constructor(resource) {
    super(`${resource} not found`, 66);
    this.name = 'NotFoundError';
  }
}

function errorHandler(error, debug = false) {
  if (error instanceof CliError) {
    console.error(`Error: ${error.message}`);
    process.exit(error.exitCode);
  }

  if (debug) {
    console.error(error.stack);
  } else {
    console.error(`Error: ${error.message}`);
    console.error('Use --debug for more information');
  }

  process.exit(1);
}

// Usage
process.on('uncaughtException', (error) => errorHandler(error));
process.on('unhandledRejection', (error) => errorHandler(error));
```

## Testing

### Testing with Jest

```javascript
const { execSync, spawn } = require('child_process');

describe('CLI', () => {
  const cli = (args) => {
    return execSync(`node ./bin/cli.js ${args}`, {
      encoding: 'utf8',
    });
  };

  test('--version shows version', () => {
    const output = cli('--version');
    expect(output).toMatch(/\d+\.\d+\.\d+/);
  });

  test('--help shows help', () => {
    const output = cli('--help');
    expect(output).toContain('Usage:');
    expect(output).toContain('Commands:');
  });

  test('add command creates item', () => {
    const output = cli('add "Test Item" --priority 5');
    expect(output).toContain('Added');
  });

  test('invalid command shows error', () => {
    expect(() => cli('invalid')).toThrow();
  });
});
```

### Testing Interactive Commands

```javascript
const { spawn } = require('child_process');

function runInteractive(args, inputs) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['./bin/cli.js', ...args.split(' ')]);
    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();

      // Send input when prompted
      const lastLine = output.split('\n').pop();
      const input = inputs.shift();
      if (input && lastLine.includes('?')) {
        proc.stdin.write(input + '\n');
      }
    });

    proc.on('close', (code) => {
      resolve({ output, code });
    });

    proc.on('error', reject);
  });
}

test('interactive delete prompts for confirmation', async () => {
  const { output, code } = await runInteractive('delete "item"', ['y']);
  expect(output).toContain('Are you sure');
  expect(code).toBe(0);
});
```

## See Also

- [CLI Development Guidelines](../SKILL.md) - Core principles and patterns
- [Python CLI Patterns](python-cli.md)
- [Go CLI Patterns](go-cli.md)
- [Rust CLI Patterns](rust-cli.md)
