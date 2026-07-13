# omp-aws-mantle

Native [Oh My Pi](https://github.com/can1357/oh-my-pi) provider plugin for models served by the AWS Bedrock Mantle endpoint.

The plugin uses OMP's built-in OpenAI Responses, OpenAI Chat Completions, and Anthropic Messages transports. It does not copy the native Bedrock Converse/EventStream provider and does not install a custom streaming protocol.

## Requirements

- Oh My Pi 16.4.1 or newer.
- An AWS account with access to the desired Bedrock models.
- A supported Mantle region.
- An Amazon Bedrock API key in `AWS_BEARER_TOKEN_BEDROCK`.

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
omp plugin install github:carze/omp-aws-mantle#v0.1.0
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

The plugin requires a Mantle region and an Amazon Bedrock bearer token. Keep both variables in the shell that launches OMP.

### Existing AWS profile with a short-term token

AWS's official token generator can derive a short-term bearer token from an existing AWS CLI profile without creating an IAM user or long-term access key.

Create an isolated token-generator environment once:

```sh
python3 -m venv "$HOME/.local/share/omp-bedrock-token-generator"
"$HOME/.local/share/omp-bedrock-token-generator/bin/python" \
  -m pip install aws-bedrock-token-generator
```

Select and verify your existing profile:

```sh
export AWS_PROFILE='<your-profile>'
aws sts get-caller-identity --profile "$AWS_PROFILE"
```

For an IAM Identity Center/SSO profile, refresh the session when needed:

```sh
aws sso login --profile "$AWS_PROFILE"
```

Resolve the profile's region and generate the bearer token without printing it:

```sh
export AWS_REGION="$(aws configure get region --profile "$AWS_PROFILE")"
export AWS_MANTLE_REGION="$AWS_REGION"
export AWS_BEARER_TOKEN_BEDROCK="$(
  "$HOME/.local/share/omp-bedrock-token-generator/bin/python" \
    -c 'from aws_bedrock_token_generator import provide_token; print(provide_token())'
)"
```

Confirm only that the token has the expected shape:

```sh
if [[ "$AWS_BEARER_TOKEN_BEDROCK" == bedrock-api-key-* ]]; then
  echo "Bedrock bearer token is ready"
else
  echo "Bearer token generation failed"
fi
```

Do not print, log, commit, or place the bearer token in a shell startup file. Regenerate it when the underlying AWS session expires, then restart OMP.

### Existing Bedrock API key

If you already have a Bedrock API key, set it directly:

```sh
export AWS_MANTLE_REGION=us-east-1
read -rsp "Bedrock API key: " AWS_BEARER_TOKEN_BEDROCK
echo
export AWS_BEARER_TOKEN_BEDROCK
```

Region precedence is:

1. `AWS_MANTLE_REGION`
2. `AWS_REGION`
3. `AWS_DEFAULT_REGION`

The plugin fails during registration if no region is configured or if the region does not have a documented Mantle endpoint. It never persists or logs the resolved key.

AWS Bedrock API keys can be short-term or long-term. Short-term keys expire after at most 12 hours, or when their source AWS session expires. The plugin does not generate or refresh keys in-process. AWS recommends short-term keys for production and long-term keys only for exploration.

See [AWS Bedrock API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html) and the [AWS Bedrock Token Generator](https://github.com/aws/aws-bedrock-token-generator-python).

Refresh discovery and verify all endpoint-family providers:

```sh
omp models refresh
omp models aws-mantle
omp models aws-mantle-openai
omp models aws-mantle-anthropic
```

Start GPT-5.5:

```sh
omp --model aws-mantle-openai/openai.gpt-5.5
```

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

GPT-5.4 and GPT-5.5 use this dedicated OpenAI Responses endpoint. AWS serves these models from `/openai/v1/responses`, not the `/v1/responses` path used by GPT OSS. OMP sends `store: false`, so Mantle does not retain Responses state for the request.

### `aws-mantle-anthropic`

Base URL:

```text
https://bedrock-mantle.<region>.api.aws/anthropic/v1
```

Claude models use OMP's `anthropic-messages` transport. Model metadata includes the required Mantle `X-Api-Key` configuration and the transport sends `anthropic-version: 2023-06-01`.

## Model discovery

Mantle's Models API reports availability but does not provide all metadata OMP needs for safe routing. The plugin intersects discovered IDs with curated metadata in:

- `src/model-catalog.ts`
- `src/anthropic-catalog.ts`

Unknown IDs are omitted and reported once. They are not assigned invented context limits, prices, modalities, or reasoning behavior.

`openai.gpt-5.4` and `openai.gpt-5.5` are partitioned into `aws-mantle-openai` because their AWS model cards declare the model-specific `/openai/v1` base path. All three providers share the same authenticated `/v1/models` discovery request.

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
- Bearer API-key authentication.

## Deliberately unsupported

- Native Bedrock Converse or binary EventStream.
- SigV4 request signing and automatic AWS credential-chain refresh.
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

Opt-in real AWS model listing and one streamed response:

```sh
AWS_MANTLE_REGION=us-east-1 \
AWS_BEARER_TOKEN_BEDROCK='<key>' \
bun test test/real-aws.smoke.test.ts
```

Without both a key and region, the real-AWS test is skipped.

## References

- [AWS endpoint comparison](https://docs.aws.amazon.com/bedrock/latest/userguide/endpoints.html)
- [AWS Mantle Responses API](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-mantle.html)
- [AWS Mantle Chat Completions](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions-mantle.html)
- [AWS Mantle Anthropic Messages](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-messages-api.html)
- [AWS model/API compatibility](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html)

## License

MIT
