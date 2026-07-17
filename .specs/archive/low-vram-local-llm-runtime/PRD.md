> Archived 2026-07-17 per user decision: dormant idea PRD since 2026-05-12, no successor plan. Revive from archive if the idea returns.

---
created: 2026-05-12
status: draft
---

# PRD: Low-VRAM Local LLM Runtime Reference

## Problem

- We want a durable reference for the video’s suggested approach to running a large local LLM on a 6GB GPU.
- The target use case is future experimentation with low-VRAM local inference, especially on hardware such as an RTX A2000 6GB.
- Source video 1: https://www.youtube.com/watch?v=8F_5pdcD3HY
- Source video 2: https://www.youtube.com/watch?v=xgspXqUA6Fk
- Source video 3: https://www.youtube.com/watch?v=3mX_dc9ZNRA

## Users / Jobs To Be Done

- Primary user: Local AI operator/developer with consumer or workstation GPU hardware.
- Job/story: As a local LLM user, I want a reproducible set of runtime flags and tuning notes so I can test whether a large MoE model can run acceptably on limited VRAM.
- Current workaround: Trial-and-error with `llama.cpp` defaults, which may underperform or fail to use CPU/GPU memory effectively.

## Goals

1. Capture the videos’ recommended `llama.cpp` runtime strategy for low-VRAM systems.
2. Preserve key tuning concepts: MoE expert CPU offload, no mmap, KV-cache compression, Flash Attention, and memory locking.
3. Define validation criteria for checking whether the setup is usable and stable on the available RTX A2000 6GB card.

## Non-Goals

- Guarantee exact performance on every 6GB GPU.
- Provide a fully maintained production deployment guide.
- Benchmark all models or quantization formats.
- Replace official `llama.cpp`, model, CUDA, Docker, or driver documentation.

## Requirements

### Functional Requirements

- Document the source video URLs for traceability.
- Reference the target model class from the video: Qwen 3.6 35B A3B-style MoE model.
- Capture the baseline problem: naive GPU-layer splitting can run but may be too slow due to PCIe/CPU expert traffic.
- Capture the recommended runtime techniques:
  - Use MoE-aware CPU expert placement via `--n-cpu-moe`.
  - Tune `--n-cpu-moe` based on VRAM headroom, starting around the video’s examples of `35`, `36`, or `41`.
  - Disable mmap with `--no-mmap` so model data is loaded into RAM up front.
  - Use compressed KV cache / Turbo Quant-style cache settings where supported.
  - Also test Q8 KV cache with Flash Attention, as the second video reports useful long-context behavior with Q4 model quantization, Q8 KV cache, and Flash Attention.
  - Use `--mlock` plus container/host permissions so RAM-resident weights are not paged out.
- Record that speculative decoding was reported as slower for this MoE/SSM setup.
- Include a note that an RTX A2000 6GB should be a plausible target and likely comparable or better than the GTX 1060 6GB shown, subject to CPU/RAM/PCIe constraints.
- Treat RTX 4060 Ti 8GB results from the second video as an upper-bound/comparison point, not as an expected RTX A2000 6GB result.
- For the RTX A2000 6GB experiment, start with conservative contexts such as 16k or 64k, then increase only after VRAM, RAM, and speed are measured.
- Prefer a system with 64GB RAM if available; 32GB may be enough for limited tests but is a higher risk for swapping when using `--no-mmap` and CPU-resident experts.

### Non-Functional Requirements

- Keep the reference implementation hardware-aware and tunable rather than hard-coded.
- Avoid secrets, tokens, private credentials, or machine-specific sensitive data.
- Prefer reproducible commands and measurable validation over anecdotal claims.
- Keep the document useful as a handoff for a later `/plan-it` implementation or benchmark plan.

### Future / Emerging Optimizations

- Track Turbo Quant or equivalent KV-cache compression support in the selected runtime.
- Track whether architecture-level attention compression becomes available in practical local models/runtimes.
- DeepSeek V4-style techniques mentioned in the third video include:
  - CSA / compressed sparse attention: compress sequence, use sparse attention, keep a small local full-detail window.
  - HCA / heavily compressed attention: heavily compress sequence for cheaper global coverage.
- Treat these architecture-level methods as future-facing unless the selected model already implements them.
- Prefer runtime-level KV-cache compression for the first RTX A2000 6GB experiment, because it is more likely to be actionable without changing model families.

## Acceptance Criteria

1. [ ] The reference includes both source video URLs.
   - Verify: Inspect this PRD.
   - Pass: Both URLs are present and accurate.
   - Fail: Either URL is missing or incorrect.

2. [ ] The reference captures the main runtime ideas from the videos.
   - Verify: Check requirements for MoE offload, no mmap, VRAM tuning, KV-cache compression, Flash Attention, and mlock.
   - Pass: All major techniques are represented.
   - Fail: One or more are absent.

3. [ ] A later benchmark plan can be created from this PRD.
   - Verify: Run `/plan-it .specs/low-vram-local-llm-runtime/PRD.md`.
   - Pass: Planner has enough context to define install, run, tune, and measure steps.
   - Fail: Planner needs to rediscover the video’s core recommendations.

4. [ ] The setup guidance is explicitly caveated for local hardware differences.
   - Verify: Inspect goals, requirements, and risks.
   - Pass: CPU, RAM, PCIe, driver/runtime, and model/version variability are acknowledged.
   - Fail: Document implies guaranteed performance.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Naive `--n-gpu-layers` split | Simple and common | Video reported roughly 3 tokens/sec due to CPU/GPU traffic | Not preferred |
| MoE-aware expert CPU placement | Uses scarce VRAM for frequently active non-expert parts | Requires tuning and sufficient system RAM | Preferred starting point |
| More aggressive GPU expert placement | Can improve speed when VRAM is available | Reduces context-window headroom | Tune experimentally |
| Q8 KV cache + Flash Attention | Second video reports useful long-context agent performance on 8GB VRAM | May not fit the same context on 6GB VRAM | Test after baseline |
| Aggressive lower-bit/Turbo Quant KV cache | May recover context on 6GB VRAM | Quality risk and flag support may vary | Test with quality checks |
| Speculative decoding with small drafter | Can accelerate some transformer models | First video reported slowdown for this MoE/SSM architecture | Do not prioritize initially |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `llama.cpp` flag names or support change | Commands may not work as written later | Verify against current `llama.cpp --help` before implementation |
| Model version or quantization differs | Performance and memory usage may differ | Pin exact model artifact in a later plan |
| Insufficient system RAM | `--no-mmap` and CPU expert storage may fail or swap | Prefer 64GB RAM if available; treat 32GB as constrained; monitor memory |
| PCIe/CPU bottleneck | Token rate may be lower than video | Benchmark prompt processing and generation separately |
| `mlock` permissions missing | Long-running server may degrade due to paging | Validate locked memory via OS/container metrics |
| KV-cache compression quality regressions | Long-context answer quality may degrade | Include quality spot checks in benchmark plan |

## Open Questions

- Which exact model artifact and quantization should be used for the local test?
- Does the selected `llama.cpp` build support Turbo Quant or equivalent KV-cache compression flags?
- Do any candidate models support architecture-level attention compression that meaningfully reduces KV cache on local hardware?
- Should the first target be Docker, native Windows, WSL, or Linux?
- What context target matters most for the RTX A2000 6GB: 16k, 64k, 128k, or 256k?
- What workload should define “usable”: chat, codebase Q&A, long-document summarization, or local agent tasks?

## Plan Handoff

- Recommended next command:
  ```bash
  /plan-it .specs/low-vram-local-llm-runtime/PRD.md
  ```
- Review command:
  ```bash
  /review-it .specs/low-vram-local-llm-runtime/PRD.md
  ```
- Notes for planner:
  - Treat both videos as references, not verified benchmarks for this machine.
  - Treat the RTX 4060 Ti 8GB numbers from the second video as a comparison point; the RTX A2000 6GB has less VRAM and should start with more conservative context targets.
  - Start with safe measurement: hardware inventory, `llama.cpp` build capabilities, model selection, baseline run, then incremental flag tuning.
  - For the A2000, measure at least 16k and 64k context before attempting 128k or 256k.
  - Validate both speed and stability, especially Flash Attention support, RAM locking, and long-running behavior.
  - Keep DeepSeek V4-style hybrid attention as a research track, not a baseline requirement for the RTX A2000 6GB test.
