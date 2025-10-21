# Trocco Batch Search Server

Troccoのジョブ定義を効率的に検索するためのMCPサーバーです。

## セットアップ

### 1. 環境変数の設定

`.env.sample`ファイルをコピーして`.env`ファイルを作成し、設定を記入してください：

```bash
cp .env.sample .env
```

`.env`ファイルに以下の設定を記入してください：

```env
# 必須: Trocco APIキー
TROCCO_API_KEY=your_actual_api_key

# 必須: Trocco APIのベースURL
TROCCO_BASE_URL=https://your-company.trocco.io/api
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. Claude Desktopの設定

Claude Desktopの設定ファイルに以下を追加：

```json
{
  "mcpServers": {
    "trocco-batch-search": {
      "command": "node",
      "args": ["/path/to/trocco_mcp_server/src/server.js"]
    }
  }
}
```

## 使い方

`trocco_batch_search`ツールを使用して、ジョブ定義を検索できます。

### 検索戦略

- **exhaustive_scan**: ページネーションを使って全ての定義を順番にスキャン（デフォルト）
- **keyword_chunks**: 検索語の部分文字列で検索
- **alphabet_sweep**: アルファベット順に検索
- **recent_first**: 最新の定義から検索

### パラメータ

- `searchTerm`: 検索する文字列（必須）
- `strategy`: 検索戦略（オプション、デフォルト: exhaustive_scan）
- `maxBatches`: 最大バッチ数（オプション、デフォルト: 10、最大: 50）

