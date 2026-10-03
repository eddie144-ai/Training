// Writes workflow.json (importable into n8n) from the files in this folder.
// Run: node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

const systemPrompt = read('system-prompt.txt').trim();
// schema.json is kept exactly as written. The "$schema" line is metadata for
// downstream validators, not part of the shape, so it is left out of the copy
// sent to the API.
const { $schema, ...schema } = JSON.parse(read('schema.json'));
const buildRequest = read('build-request.js')
  .replace('__SYSTEM_PROMPT__', JSON.stringify(systemPrompt))
  .replace('__SCHEMA__', JSON.stringify(schema, null, 2));
const parseResponse = read('parse-response.js');
const toLogRow = read('to-log-row.js');
const toErrorRow = read('to-error-row.js');

// Postgres insert that maps item fields to same-named columns.
const postgresInsert = (id, name, table, position) => ({
  id,
  name,
  type: 'n8n-nodes-base.postgres',
  typeVersion: 2.5,
  position,
  parameters: {
    schema: { __rl: true, mode: 'list', value: 'public' },
    table: { __rl: true, mode: 'name', value: table },
    columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [] },
    options: {},
  },
  credentials: { postgres: { id: '', name: 'Postgres' } },
});

const workflow = {
  name: 'Telemetry ingest (Claude)',
  nodes: [
    {
      id: 'b1f0c6a2-0001-4c1e-9a10-000000000001',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
      webhookId: 'b1f0c6a2-0001-4c1e-9a10-0000000000ff',
      parameters: { httpMethod: 'POST', path: 'telemetry-ingest', responseMode: 'lastNode', options: {} },
    },
    {
      id: 'b1f0c6a2-0001-4c1e-9a10-000000000002',
      name: 'Build Claude request',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [220, 0],
      parameters: { mode: 'runOnceForEachItem', jsCode: buildRequest },
    },
    {
      id: 'b1f0c6a2-0001-4c1e-9a10-000000000003',
      name: 'Claude Messages API',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [440, 0],
      parameters: {
        method: 'POST',
        url: 'https://api.anthropic.com/v1/messages',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'anthropic-version', value: '2023-06-01' },
            { name: 'anthropic-beta', value: 'server-side-fallback-2026-07-01' },
          ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json.request) }}',
        options: {
          timeout: 300000,
          response: { response: { neverError: true } },
        },
      },
      credentials: { httpHeaderAuth: { id: '', name: 'Anthropic API key' } },
    },
    {
      id: 'b1f0c6a2-0001-4c1e-9a10-000000000004',
      name: 'Parse Claude response',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [660, 0],
      parameters: { mode: 'runOnceForEachItem', jsCode: parseResponse },
    },
    {
      id: 'b1f0c6a2-0001-4c1e-9a10-000000000005',
      name: 'Parsed OK?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [880, 0],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
          conditions: [
            {
              id: 'b1f0c6a2-0001-4c1e-9a10-0000000000a1',
              leftValue: '={{ $json.success }}',
              rightValue: '',
              operator: { type: 'boolean', operation: 'true', singleValue: true },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
    },
    {
      id: 'b1f0c6a2-0001-4c1e-9a10-000000000006',
      name: 'To log row',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1100, -100],
      parameters: { mode: 'runOnceForEachItem', jsCode: toLogRow },
    },
    postgresInsert('b1f0c6a2-0001-4c1e-9a10-000000000007', 'Insert telemetry log', 'telemetry_logs', [1320, -100]),
    {
      id: 'b1f0c6a2-0001-4c1e-9a10-000000000008',
      name: 'To error row',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1100, 100],
      parameters: { mode: 'runOnceForEachItem', jsCode: toErrorRow },
    },
    postgresInsert('b1f0c6a2-0001-4c1e-9a10-000000000009', 'Insert ingest error', 'telemetry_ingest_errors', [1320, 100]),
  ],
  connections: {
    Webhook: { main: [[{ node: 'Build Claude request', type: 'main', index: 0 }]] },
    'Build Claude request': { main: [[{ node: 'Claude Messages API', type: 'main', index: 0 }]] },
    'Claude Messages API': { main: [[{ node: 'Parse Claude response', type: 'main', index: 0 }]] },
    'Parse Claude response': { main: [[{ node: 'Parsed OK?', type: 'main', index: 0 }]] },
    'Parsed OK?': {
      main: [
        [{ node: 'To log row', type: 'main', index: 0 }],
        [{ node: 'To error row', type: 'main', index: 0 }],
      ],
    },
    'To log row': { main: [[{ node: 'Insert telemetry log', type: 'main', index: 0 }]] },
    'To error row': { main: [[{ node: 'Insert ingest error', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};

writeFileSync(new URL('workflow.json', import.meta.url), JSON.stringify(workflow, null, 2) + '\n');
console.log('wrote workflow.json');
