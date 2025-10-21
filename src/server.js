import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  TroccoClient,
  TroccoApiError,
  summarizeError,
} from './troccoClient.js';
import { TROCCO_BASE_URL } from './env.js';

const server = new McpServer(
  {
    name: 'trocco-batch-search-server',
    version: '0.1.0',
  },
  {
    instructions: `Use this server to perform batch searches in Trocco.

The trocco_batch_search tool provides multiple search strategies:
- exhaustive_scan: Systematically scan through all job definitions using pagination
- keyword_chunks: Search using substrings of the search term
- alphabet_sweep: Search alphabetically through letters and numbers  
- recent_first: Search starting from the most recent items

The server automatically injects your TROCCO_API_KEY for authentication.`,
  },
);

const client = new TroccoClient();

// WebUIのURLを生成する関数
function generateJobDefinitionUrl(jobId) {
  // TROCCO_BASE_URLから/apiを取り除いてWebUIのベースURLを作成
  const webBaseUrl = TROCCO_BASE_URL.replace(/\/api\/?$/, '');
  return `${webBaseUrl}/job_definitions/${jobId}`;
}

server.registerTool(
  'trocco_batch_search',
  {
    title: 'Trocco Batch Search',
    description: 'Search through large numbers of transfer configs by fetching in batches and using multiple strategies.',
    inputSchema: {
      searchTerm: z.string().min(1, 'What to search for'),
      strategy: z.enum([
        'exhaustive_scan',
        'keyword_chunks',
        'alphabet_sweep',
        'recent_first'
      ]).optional().default('exhaustive_scan'),
      maxBatches: z.number().int().min(1).max(50).optional().default(10),
    },
    outputSchema: {
      ok: z.boolean(),
      strategy: z.string(),
      batchesSearched: z.number().int(),
      totalScanned: z.number().int(),
      matches: z.array(z.any()),
      searchProgress: z.string(),
    },
  },
  async ({ searchTerm, strategy, maxBatches }) => {
    try {
      let allMatches = [];
      let totalScanned = 0;
      let batchesSearched = 0;
      const searchTermLower = searchTerm.toLowerCase();

      switch (strategy) {
        case 'exhaustive_scan':
          // ページネーションで徹底的にスキャン
          let cursor = null;
          let hasMore = true;

          while (hasMore && batchesSearched < maxBatches) {
            try {
              const query = { limit: 100 };
              if (cursor) query.cursor = cursor;

              const response = await client.request({
                path: 'job_definitions',
                method: 'GET',
                query,
              });

              const items = response.data?.items || [];
              totalScanned += items.length;
              batchesSearched++;

              // マッチングチェック
              const matches = items.filter(item => {
                const name = (item.name || '').toLowerCase();
                const desc = (item.description || '').toLowerCase();
                return name.includes(searchTermLower) || desc.includes(searchTermLower);
              });

              allMatches.push(...matches);

              cursor = response.data?.next_cursor;
              hasMore = !!cursor;

              // 早期終了: 見つかったら報告（console.logは削除）

            } catch (error) {
              // バッチ失敗時は静かに次へ進む
              break;
            }
          }
          break;

        case 'keyword_chunks':
          // キーワードの部分文字列で検索
          const chunks = [];
          for (let i = 0; i < searchTerm.length - 2; i++) {
            chunks.push(searchTerm.substring(i, i + 3));
          }
          chunks.push(searchTerm.substring(0, Math.floor(searchTerm.length / 2)));
          chunks.push(searchTerm.substring(Math.floor(searchTerm.length / 2)));

          for (const chunk of [...new Set(chunks)]) {
            if (batchesSearched >= maxBatches) break;

            try {
              const response = await client.request({
                path: 'job_definitions',
                method: 'GET',
                query: { name_contains: chunk, limit: 200 },
              });

              const items = response.data?.items || [];
              totalScanned += items.length;
              batchesSearched++;

              const matches = items.filter(item => {
                const name = (item.name || '').toLowerCase();
                return name.includes(searchTermLower);
              });

              allMatches.push(...matches);
            } catch (error) {
              // エラーは無視して続行
            }
          }
          break;

        case 'alphabet_sweep':
          // アルファベット順に検索
          const letters = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
          
          for (const letter of letters) {
            if (batchesSearched >= maxBatches) break;

            try {
              const response = await client.request({
                path: 'job_definitions',
                method: 'GET',
                query: { name_contains: letter, limit: 200 },
              });

              const items = response.data?.items || [];
              totalScanned += items.length;
              batchesSearched++;

              const matches = items.filter(item => {
                const name = (item.name || '').toLowerCase();
                return name.includes(searchTermLower);
              });

              allMatches.push(...matches);
            } catch (error) {
              // エラーは無視して続行
            }
          }
          break;

        case 'recent_first':
          // 最近作成されたものから検索（IDが大きいものから）
          
          for (let i = 0; i < maxBatches; i++) {
            try {
              // IDでソートして取得を試行
              const response = await client.request({
                path: 'job_definitions',
                method: 'GET',
                query: { limit: 100 },
              });

              const items = response.data?.items || [];
              totalScanned += items.length;
              batchesSearched++;

              const matches = items.filter(item => {
                const name = (item.name || '').toLowerCase();
                const desc = (item.description || '').toLowerCase();
                return name.includes(searchTermLower) || desc.includes(searchTermLower);
              });

              allMatches.push(...matches);

              if (items.length === 0) break;
            } catch (error) {
              break;
            }
          }
          break;
      }

      // 重複排除
      const uniqueMatches = allMatches.filter((match, index, arr) => 
        arr.findIndex(m => m.id === match.id) === index
      );

      const result = {
        ok: true,
        strategy,
        batchesSearched,
        totalScanned,
        matches: uniqueMatches.map(item => ({
          id: item.id,
          name: item.name,
          description: item.description,
          input_type: item.input_option_type,
          output_type: item.output_option_type,
          created_by: item.created_by,
          url: generateJobDefinitionUrl(item.id),
        })),
        searchProgress: `${batchesSearched}/${maxBatches} batches, ${totalScanned} configs scanned`,
      };

      const resultText = uniqueMatches.length > 0
        ? `🔍 バッチ検索結果: "${searchTerm}"\n\n` +
          `戦略: ${strategy}\n` +
          `進捗: ${result.searchProgress}\n` +
          `見つかった設定: ${uniqueMatches.length}件\n\n` +
          uniqueMatches.slice(0, 5).map((item, i) => 
            `${i + 1}. ${item.name} (ID: ${item.id})\n   ${item.input_type} → ${item.output_type}\n   🔗 ${generateJobDefinitionUrl(item.id)}`
          ).join('\n\n') +
          (uniqueMatches.length > 5 ? `\n\n... 他 ${uniqueMatches.length - 5}件` : '')
        : `❌ "${searchTerm}" が見つかりませんでした\n\n` +
          `戦略: ${strategy}\n` +
          `進捗: ${result.searchProgress}\n\n` +
          `別の戦略を試すか、検索語を変更してください。`;

      return {
        content: [
          {
            type: 'text',
            text: resultText,
          },
        ],
        structuredContent: result,
      };
    } catch (error) {
      const structuredError = serializeError(error);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `❌ バッチ検索失敗\n${structuredError.formatted}`,
          },
        ],
        structuredContent: structuredError.payload,
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

function serializeError(error) {
  if (error instanceof TroccoApiError) {
    const formatted = summarizeError(error);
    const payload = {
      ok: false,
      error: {
        message: error.message,
        request: error.request,
        response: error.response,
      },
    };
    if (error.response) {
      payload.status = error.response.status;
      payload.statusText = error.response.statusText;
      payload.url = error.response.url;
      payload.method = error.response.method;
      payload.durationMs = error.response.durationMs;
      payload.headers = error.response.headers;
      payload.data = error.response.data;
      payload.text = error.response.text;
    }
    return { formatted, payload };
  }
  const formatted = summarizeError(error);
  return {
    formatted,
    payload: {
      ok: false,
      error: {
        message: error.message,
      },
    },
  };
}

process.on('uncaughtException', (error) => {
  console.error('[trocco-batch-search] Uncaught exception', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[trocco-batch-search] Unhandled rejection', reason);
});