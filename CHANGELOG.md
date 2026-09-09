# Changelog

## [Unreleased]

## 0.1.1 - 2026-09-09

### Added

- Added GPT-6 Astra through the dedicated `aws-mantle-openai` Responses endpoint with its full 1,050,000-token context window, AWS pricing, image input, and five-tier reasoning support.
- Added GPT-5.6 Luna, Sol, and Terra through the dedicated `aws-mantle-openai` Responses endpoint, including AWS pricing and five-tier reasoning support.
- Added xAI Grok 4.6 through the dedicated `aws-mantle-openai` Responses endpoint with 500K context, low/medium/high/xhigh reasoning, image input, encrypted reasoning replay, and structured tool schemas.
- Added SigV4 authentication for model discovery and every inference transport through OMP's refreshable AWS credential chain, including IAM Identity Center/SSO recovery guidance.
- Kept `AWS_BEARER_TOKEN_BEDROCK` as an automatic bearer-authentication override for local and existing key workflows.

### Fixed

- Routed GPT-5.4 and GPT-5.5 through a dedicated `aws-mantle-openai` provider using their required `/openai/v1` base path instead of the generic `/v1` endpoint.
- Updated GPT-5.6 Mantle pricing and reasoning metadata to match OMP 17.4.0's native `bedrock-mantle` catalog.
- Made Anthropic Messages authentication mode-aware so bearer requests send `X-Api-Key` while SigV4 requests do not leak a placeholder API-key header.
- Added the explicit JSON content type required for Mantle to validate SigV4 model-discovery signatures.

## 0.1.0 - 2026-07-10

### Added

- Native Oh My Pi provider registration for AWS Bedrock Mantle.
- Dynamic `/v1/models` discovery with strict response validation and sanitized failures.
- OpenAI Responses and Chat Completions routing for curated Mantle models.
- Anthropic Messages routing for curated Claude models.
- Shared in-process discovery, credential-rotation invalidation, and retry-safe cache eviction.
- Deterministic transport, discovery, catalog, lifecycle, and package tests.
- Opt-in real AWS model-listing and streamed-response smoke test.
