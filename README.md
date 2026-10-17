# NIIGO

家庭のタスクを Google Sheets と Web 画面から編集するアプリです。1つのスプレッドシートが1つの Space に対応します。Google Sheets が保存先であり、Sheets 上の編集内容も Web 画面に反映されます。

## 構成

- `web/` はブラウザで動く JavaScript の画面です。シートの列位置やセルのメモを意識せず、Task、Round などのデータとして扱います。
- `server/` は Web 画面の API と Google Sheets の読み書きを担当します。画面から Google の認証情報を扱いません。
- `apps-script/static/` はシートのメニューと動的ソース呼び出しを担当します。`apps-script/dynamic/` は Drive から読み込む処理本体です。どちらも Git 管理します。

## Google Sheets と Apps Script の準備

作成済みの シート には、4タブと Apps Script プロジェクトを配置済みです。`.env` の `NIIGO_APPS_SCRIPT_SOURCE_FILE_ID` に動的ソースを置く Drive ファイルの ID を設定し、`npm run apps-script:bootstrap` を一度実行して固定コードを反映します。初回は clasp の Google OAuth が必要です。その後、シートの「GAS → 初期設定」を一度実行して Drive 読み取りと編集トリガーの権限を承認します。初期設定では、既存行の ID 欠損も補完します。

新しい Space を作る場合は、`.clasp.json` の `scriptId` と `parentId` を設定して bootstrap を実行します。固定コードは `apps-script/static/`、動的コードは `apps-script/dynamic/` に置きます。

## Web 画面をローカルで起動

1. `npm install` を実行します。
2. `.env.example` を `.env` にコピーし、`NIIGO_SPREADSHEET_ID` に対象のスプレッドシート ID を設定します。
3. Google Sheets API を利用できるサービスアカウントを用意し、そのメールアドレスに対象シートの編集権限を付与します。認証情報の JSON 全体を1行にして、`.env` の `GOOGLE_SERVICE_ACCOUNT_JSON` に設定します。秘密鍵の改行は JSON 内で `\n` のまま保存してください。鍵を Git に追加しないでください。
4. `npm run dev` を実行し、`http://127.0.0.1:3000` を開きます。`npm start` でも同じように起動できます。

サーバーはローカルホストで待ち受けます。家庭内で Web 画面を共有するための認証と公開方法は、まだ決めていません。公開する際は利用者の認証と Sheets への権限を設定する必要があります。

## Apps Script の動的ソースをデプロイ

`npm run apps-script:deploy` はサービスアカウントを使い、既存シートの `Tasks` に参照先 ID の列を追加し、既存タスクの値を補完します。旧形式の ID メモも削除します。その後、`.env` の `NIIGO_APPS_SCRIPT_SOURCE_FILE_ID` が示す Drive ファイルへ `apps-script/dynamic/Runtime.js` をアップロードし、読み戻して一致を確認します。通常のアプリデプロイにこのコマンドを含めてください。固定コードを変更した場合や参照先 ID を変えた場合は `npm run apps-script:bootstrap` を実行します。

サービスアカウントによるデプロイ時更新の検証経緯は [Apps Script のデプロイ時更新に関する検証](docs/apps-script-deploy-feasibility.md) にまとめています。

## シートでの操作

`Tasks` の担当者には、メンバー名をカンマで区切って直接入力できます。Web 画面ではタスクの編集画面から担当者を選択できます。

ラウンドを終了するときは Web 画面を使います。未完了のタスクごとに次のラウンドまたはタスク一覧への移動を選択できます。`Rounds.status` をシート上で直接 `Closed` に変更した場合は元に戻し、Web 画面での操作へ案内します。

## 採用した設計

- `Tasks` の `category`、`assignees`、`round` には参照先の名前を表示します。紐付けには非表示の `categoryId`、`assigneeIds`、`roundId` を使います。担当者の ID は JSON 配列で記録します。名前を変更しても ID による紐付けは維持します。
- ID は UUID です。Web 画面からの追加時と、初期設定後に Sheets で行を編集した時に付与します。編集時の自動付与には「GAS → 初期設定」で作るインストール型トリガーが必要です。欠損や重複を検出した場合は Web 画面の読み書きを止めます。コピーした行の ID は自動変更しません。
- Task の初期ステータスは `Todo`、Round は `Planned` です。Task の名前以外の項目と Round の日付は空欄を許します。日付を入力する場合は `YYYY-MM-DD` とし、Round の終了日は開始日以降にします。進行中の Round は1件までです。
- Web 画面で保存する際は、読み込んだ行の内容と保存直前の内容を照合します。食い違う場合は再読み込みを求めます。行と列は保存直前に ID と見出しから探し直します。
- ラウンド終了時は未完了 Task ごとに移動先を指定します。次の Round がない場合も Backlog を選べます。完了 Task と期限は変更しません。
- ID 列と `Tasks` の参照先 ID 列は非表示にして編集時の警告を設定します。タブと必須見出しの名前は変更しないでください。独自列は保持します。

## 制限

編集トリガーは Sheets の通常のセル編集で動作します。外部 API や別のスクリプトによる変更では動作しないため、その経路で行を追加した場合は ID と参照先 ID 列を別途整える必要があります。複数セルを同時に貼り付けてラウンドを `Closed` にする操作では、終了時の移動先選択を行えません。

Web 画面の削除、検索、並べ替え、絞り込みは実装していません。Sheets の変更と Web 画面からの保存が同時に起きた場合、保存直前の再読込後の変更までは検出できません。

`npm test` で保存処理を検証できます。
