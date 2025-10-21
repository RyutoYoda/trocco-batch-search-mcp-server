# Trocco Batch Search MCP Server

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

# 推奨: Trocco APIのベースURL（URL生成に必要）
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

## 例

```
trocco_batch_search(searchTerm="売上", strategy="exhaustive_scan", maxBatches=20)
```

これにより、「売上」を含むジョブ定義を最大20バッチ分検索します。

## 取得できる情報

- **基本情報**: 名前、説明、入出力タイプ、作成者、URL
- **S3設定**: バケット名、パスプレフィックス (`s3://bucket/prefix`)  
- **Snowflake設定**: データベース.スキーマ.テーブル (warehouse: name)
- **BigQuery設定**: プロジェクト.データセット.テーブル

## 制限事項

- **検索対象**: データ転送設定（job_definitions）のみ
- **詳細取得**: 検索結果の最初の5件のみ詳細情報を取得
- **対応DB**: S3、Snowflake、BigQueryのみ詳細表示対応

