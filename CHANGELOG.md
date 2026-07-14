# Changelog

## [Unreleased]

### Added

- Added GPT-5.6 Luna, Sol, and Terra through the dedicated `aws-mantle-openai` Responses endpoint, including AWS pricing and five-tier reasoning support.

### Fixed

- Routed GPT-5.4 and GPT-5.5 through a dedicated `aws-mantle-openai` provider using their required `/openai/v1` base path instead of the generic `/v1` endpoint.

## 0.1.0 - 2026-07-10

### Added

- Native Oh My Pi provider registration for AWS Bedrock Mantle.
- Dynamic `/v1/models` discovery with strict response validation and sanitized failures.
- OpenAI Responses and Chat Completions routing for curated Mantle models.
- Anthropic Messages routing for curated Claude models.
- Shared in-process discovery, credential-rotation invalidation, and retry-safe cache eviction.
- Deterministic transport, discovery, catalog, lifecycle, and package tests.
- Opt-in real AWS model-listing and streamed-response smoke test.
