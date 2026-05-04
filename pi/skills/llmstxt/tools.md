# llms.txt Tools & Ecosystem

## Python CLI

```bash
pip install llms-txt

# Parse and convert to XML context
llms_txt2ctx llms.txt > context.xml

# Python API
from llms_txt import parse_llms_file, create_ctx
parsed = parse_llms_file(content)
context = create_ctx(parsed)
```

## Static Site Generators

- **VitePress**: `vitepress-plugin-llms`
- **Docusaurus**: `docusaurus-plugin-llms`
- **Mintlify**: Built-in support

## Other Tools

- **Firecrawl**: llms.txt Generator for any website
- **VS Code PagePilot**: Loads external llms.txt context
- **llms-txt-php**: PHP library for reading/writing
