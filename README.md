# omp-aws-mantle

Native [Oh My Pi](https://github.com/can1357/oh-my-pi) provider plugin for models served by the AWS Bedrock Mantle endpoint.

The plugin keeps OMP's built-in OpenAI Responses, OpenAI Chat Completions, and Anthropic Messages transports, then wraps their HTTP requests with OMP's native Mantle authentication fetch. It does not copy those streaming protocols.

## Requirements

- Oh My Pi 17.2.6 or newer.
- An AWS account with access to the desired Bedrock models.
- A supported Mantle region.
- Either AWS credentials for SigV4, or an Amazon Bedrock API key in `AWS_BEARER_TOKEN_BEDROCK`.

## Install

From npm after publication:

```sh
omp plugin install omp-aws-mantle
```

From GitHub:

```sh
omp plugin install github:carze/omp-aws-mantle
```

Pin a tagged release when one is available:

```sh
omp plugin install github:carze/omp-aws-mantle#v0.1.1
```

From this checkout:

```sh
bun install
bun run build
omp plugin install ./path/to/omp-aws-mantle
```

Validate the plugin package:

```sh
omp plugin doctor
```

## Configure

Set an explicit Mantle region, or use the region from the active AWS profile:

```sh
export AWS_MANTLE_REGION=us-east-1
```

Region precedence is:

1. `AWS_MANTLE_REGION`
2. `AWS_REGION`
3. `AWS_DEFAULT_REGION`
4. The active AWS shared-config profile's region

The plugin fails during registration if no region is configured or if the region does not have a documented Mantle endpoint.

### Recommended: AWS credentials with SigV4

Select and verify an existing AWS profile:

```sh
export AWS_PROFILE='<your-profile>'
aws sts get-caller-identity --profile "$AWS_PROFILE"
```

For an IAM Identity Center/SSO profile, log in before launching OMP:

```sh
aws sso login --profile "$AWS_PROFILE"
```

Do not set `AWS_BEARER_TOKEN_BEDROCK`. The plugin signs model discovery and inference requests for the `bedrock-mantle` service through OMP's native AWS credential resolver. Its credential chain supports:

1. `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optional `AWS_SESSION_TOKEN`
2. Web identity (`AWS_WEB_IDENTITY_TOKEN_FILE` and `AWS_ROLE_ARN`)
3. Shared AWS profiles, including static credentials, IAM Identity Center/SSO, `credential_process`, and role chaining
4. ECS/container credentials
5. EC2 instance metadata credentials

Temporary credentials are refreshed before expiration. A `401` or `403` invalidates the cached credentials so the next request resolves the chain again. If an SSO token is absent or expired, the plugin reports the exact recovery command:

```text
aws sso login --profile "<your-profile>"
```

#### IAM permissions

The caller needs Mantle model discovery and inference permissions. This broad starting policy can be narrowed to the applicable Mantle project ARN:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock-mantle:ListModels",
        "bedrock-mantle:CreateInference"
      ],
      "Resource": "*"
    }
  ]
}
```

`ListModels` covers `GET /v1/models`. `CreateInference` covers the Responses, Chat Completions, and Anthropic Messages routes used by this plugin. Model access and any organization policies still apply.

See [AWS Mantle IAM actions](https://docs.aws.amazon.com/service-authorization/latest/reference/list_bedrock-mantle.html).

### Optional: Bedrock bearer API key

Bearer authentication remains available for local development or an existing key workflow:

```sh
export AWS_MANTLE_REGION=us-east-1
read -rsp "Bedrock API key: " AWS_BEARER_TOKEN_BEDROCK
echo
export AWS_BEARER_TOKEN_BEDROCK
```

When `AWS_BEARER_TOKEN_BEDROCK` is present, it takes precedence over SigV4. The plugin reads it when creating each discovery or inference request, but it does not generate a replacement token. AWS recommends short-term keys for production and long-term keys only for exploration.

Do not print, log, commit, or place the bearer token in a shell startup file. Prefer SigV4 when the source credentials can expire because OMP refreshes that credential chain in-process.

See [AWS Bedrock API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html).

Refresh discovery and verify all endpoint-family providers:

```sh
omp models refresh
omp models aws-mantle
omp models aws-mantle-openai
omp models aws-mantle-anthropic
```

Start GPT-6 Astra (AWS currently exposes its Mantle endpoint only in `us-west-2`):

```sh
omp --model aws-mantle-openai/openai.gpt-6-astra
```

GPT-6 Astra supports text and image input, a 1,050,000-token context window, up to 128,000 output tokens, and `low`, `medium`, `high`, `xhigh`, and `max` reasoning effort. AWS charges higher token rates when input exceeds 272,000 tokens.

Start a Grok 4.6 or GPT-5.6 model:

```sh
omp --model aws-mantle-openai/xai.grok-4.6
omp --model aws-mantle-openai/openai.gpt-5.6-terra
omp --model aws-mantle-openai/openai.gpt-5.6-sol
omp --model aws-mantle-openai/openai.gpt-5.6-luna
```

Terra is the balanced option, Sol is the highest-capability option, and Luna is the fast, lower-cost option. AWS currently offers Terra and Luna in `us-east-1`, `us-east-2`, and `us-west-2`; Sol is available in `us-east-1` and `us-east-2`; Grok 4.6 is available through Bedrock Mantle in `us-west-2`. Discovery only exposes models available to the configured account and region.

## Providers

### `aws-mantle`

Base URL:

```text
https://bedrock-mantle.<region>.api.aws/v1
```

The plugin discovers account-visible IDs through `GET /v1/models`, then routes each verified model through either:

- `openai-responses`; or
- `openai-completions`.

Responses is preferred when AWS documents support. OMP sends `store: false`, so Mantle does not retain Responses state for the request. Stateful `previous_response_id` chaining is not enabled by this plugin.

### `aws-mantle-openai`

Base URL:

```text
https://bedrock-mantle.<region>.api.aws/openai/v1
```

Grok 4.6, GPT-5.4, GPT-5.5, GPT-5.6, and GPT-6 Astra use this dedicated OpenAI Responses endpoint. AWS serves these models from `/openai/v1/responses`, not the `/v1/responses` path used by GPT OSS. OMP sends `store: false`, so Mantle does not retain Responses state for the request.

### `aws-mantle-anthropic`

Base URL:

```text
https://bedrock-mantle.<region>.api.aws/anthropic/v1
```

Claude models use OMP's `anthropic-messages` transport and send `anthropic-version: 2023-06-01`. Bearer requests add Mantle's `X-Api-Key`; SigV4 requests omit it and sign the request instead.

## Model discovery

Mantle's Models API reports availability but does not provide all metadata OMP needs for safe routing. The plugin intersects discovered IDs with curated metadata in:

- `src/model-catalog.ts`
- `src/anthropic-catalog.ts`

Unknown IDs are omitted and reported once. They are not assigned invented context limits, prices, modalities, or reasoning behavior.

`openai.gpt-5.4`, `openai.gpt-5.5`, the `openai.gpt-5.6-{luna,sol,terra}` models, `openai.gpt-6-astra`, and `xai.grok-4.6` are partitioned into `aws-mantle-openai` because their AWS model cards declare the model-specific `/openai/v1` base path. All three providers share the same authenticated `/v1/models` discovery request.

To add a model:

1. Verify the exact `bedrock-mantle` model ID in its AWS model card.
2. Verify API support in the [AWS API compatibility matrix](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html).
3. Copy context window, output limit, modalities, reasoning mode, and current token prices from primary AWS sources.
4. Add a catalog entry and focused test.
5. Run `bun run check` and the opt-in AWS smoke test.

OMP owns the durable 24-hour runtime model cache. The plugin only coalesces concurrent discovery across its three endpoint-family providers during one extension load; it does not create a second disk cache.

## Supported Mantle behavior

- OpenAI Responses SSE.
- OpenAI Chat Completions SSE.
- Anthropic Messages SSE.
- Client-side tools.
- Supported text, image, reasoning, and Claude thinking capabilities on curated models.
- SigV4 authentication with automatic AWS credential-chain refresh.
- Bearer API-key authentication.

## Deliberately unsupported

- Native Bedrock Converse or binary EventStream.
- Cross-region inference profiles.
- Bedrock Guardrails on Mantle.
- Anthropic Messages `output_config.format`; AWS rejects this on Mantle.
- Mantle Projects, Workspaces, background Responses, stored response chains, and server-side tools.

Use OMP's built-in `amazon-bedrock` provider when you need Converse, cross-region profiles, or Bedrock-native features.

## Data retention

AWS Mantle Responses defaults to stored state when `store` is true and can retain it for 30 days. OMP's Responses transport currently sends `store: false`; this is covered by the plugin's transport contract tests. Do not enable stateful response chaining without reviewing the retention implications.

## Test

Deterministic checks, with no AWS calls:

```sh
bun run check
```

The release smoke packs the npm artifact, installs the tarball into an isolated OMP plugin root, verifies discovery plus disable/enable/uninstall behavior, and completes one mocked streamed turn from the packed `dist/extension.js`:

```sh
bun run test:pack
```

Opt-in real AWS model listing and one streamed response with SigV4:

```sh
AWS_MANTLE_REAL_SMOKE=1 \
AWS_MANTLE_REGION=us-east-1 \
AWS_PROFILE='<your-profile>' \
bun test test/real-aws.smoke.test.ts
```

Set `AWS_BEARER_TOKEN_BEDROCK` instead of `AWS_PROFILE` to exercise bearer authentication. Without `AWS_MANTLE_REAL_SMOKE=1`, the real-AWS test is skipped.

## References

- [AWS endpoint comparison](https://docs.aws.amazon.com/bedrock/latest/userguide/endpoints.html)
- [AWS Mantle Responses API](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-mantle.html)
- [AWS Mantle Chat Completions](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions-mantle.html)
- [AWS Mantle Anthropic Messages](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-messages-api.html)
- [AWS model/API compatibility](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html)

## License

MIT
