# Tool presentation

- Design the collapsed view for the operator rather than serializing the tool result. Show the action, a recognizable subject, the outcome, and any actionable warning.
- Prefer names, labels, paths, and concise descriptions over internal IDs. Keep pane IDs, UUIDs, protocol fields, and other transport metadata in expanded details unless the operator must act on them.
- Render structured results semantically: confirmations as short statements, lists as bounded rows, and captured output as output rather than JSON containing an `output` field.
- Give in-progress calls a meaningful heading. On completion, avoid empty cards and avoid repeating the same information in both the call and result.
- Keep exact model-facing content separate from presentation. A compact renderer must not remove evidence needed by the model or hide complete diagnostic details from the expanded view.
- Render expected failures in plain language with relevant context. Preserve raw error codes and protocol diagnostics in expanded details.
- Test collapsed and expanded rendering, long values, missing optional labels, errors, and narrow terminal widths.
