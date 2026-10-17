# Apps Script のデプロイ時更新に関する検証

2026-10-17 時点の検証結果。対象は既存の NIIGO シートに紐付く Apps Script と、Web サーバーが使うサービスアカウント。

実装では `apps-script/static/` と `apps-script/dynamic/` を分けた。`npm run apps-script:deploy` は動的ソースを Drive ファイルへ更新する。Drive への更新と読み戻し確認は成功した。固定コードも clasp の OAuth 認証後に `npm run apps-script:bootstrap` で反映し、対象プロジェクトのコードと一致することを確認した。

## 要件

1. Apps Script の処理本体を Git で管理する。
2. アプリのデプロイ時に、サービスアカウントだけで処理本体を更新する。毎回の `clasp login` や手動コピーは不要にする。
3. シートを開く、編集する、メニューを選ぶ各経路を維持する。
4. デプロイが失敗した場合に、更新前のソースへ戻せるようにする。

## 検証結果

| 経路 | 結果 | 根拠 |
| --- | --- | --- |
| サービスアカウントで Apps Script の内容を取得 | 成功 | 対象プロジェクトの `projects.getContent` で3ファイルを取得した。 |
| 同じアカウントで Apps Script の内容を更新 | 失敗 | 同じ内容の `projects.updateContent` が HTTP 403。応答は Apps Script API のユーザー設定が無効という内容。Google も[サービスアカウントによる Apps Script API の利用をサポートしていない](https://developers.google.com/apps-script/api/concepts)と記載している。Cloud プロジェクトで API を有効にするだけでは解消しない。 |
| サービスアカウントで Drive 上の通常ファイルを取得・更新 | 成功 | NIIGO フォルダに検証用 JS ファイルを作成し、サービスアカウントに編集権限を付与。Drive API で取得、`files.update` のメディア更新、再取得による一致確認まで実施した。[Drive API の仕様](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update)にも合致する。 |
| Apps Script の実行時に Drive ファイルを読み、動的な JS として実行 | 仕様上可能、実機未検証 | Apps Script の V8 は [`eval()` と `new Function()` で生成したコードを実行する](https://developers.google.com/apps-script/guides/support/troubleshooting)。Drive のファイルは [`DriveApp.getFileById()`](https://developers.google.com/apps-script/reference/drive/drive-app) で取得できる。ただし対象プロジェクトで読み込みから各関数の呼び出しまで通す試験は未実施。 |
| 単純トリガーから別の Drive ファイルを読む | 不可 | [単純トリガーは認可を要するサービスや別ファイルにアクセスできない](https://developers.google.com/apps-script/guides/triggers)。 |

動的ソースファイルの ID は `NIIGO_APPS_SCRIPT_SOURCE_FILE_ID` として `.env` から読み込む。現在の値は `1IL7_FzJ1frPIV0mGO_H9Ps7TVt6qN58R`。サービスアカウントでこのファイルを更新でき、所有者の Apps Script から読み取れる Drive ファイルとして管理する。

## 成立する構成

初回だけ、シートに紐付く Apps Script に固定の起動コードを配置する。`onOpen` は固定コード内でメニューを作り、Drive へはアクセスしない。`sheetEdited` などのインストール型トリガーと、メニューが呼ぶ関数も固定コードに名前を残す。これらの関数が Drive 上のソースを読み込み、対応する処理へ委譲する。[インストール型トリガーは認可が必要なサービスを呼べる](https://developers.google.com/apps-script/guides/triggers/installable)。

デプロイでは、Git の `apps-script/dynamic/Code.js` を JSON にまとめ、サービスアカウントで既存の Drive ファイルへ書き込む。アップロード後に読み戻して一致を確認する。

固定コードに残す公開関数は、`setup`、`onOpen`、`sheetEdited`、`getData`、`saveEntity`、`closeRound`。トリガーは Drive 上の関数名を直接発見できないため、`sheetEdited` などの委譲関数を固定コードに置く。`setup` がトリガーを作り直しても、その委譲関数名を使う。

初回配置と Drive 読み取り権限の承認には、所有者の OAuth 操作が一度必要。`DriveApp` の読み取りに必要なスコープを `appsscript.json` に追加し、トリガー作成者が再承認する。[スコープ追加後のトリガーは手動で再承認が必要](https://developers.google.com/apps-script/guides/services/authorization)。固定コードやマニフェストを後から変更する場合も、Apps Script プロジェクトの更新経路が別途必要になる。

## Apps Script 側で残る確認

固定コードは clasp で対象プロジェクトへ反映済み。シート上では次を確認する。

1. メニューから `setup()` を一度実行し、Drive 読み取り権限を承認して編集トリガーを作る。
2. `onOpen` のメニュー表示とインストール型 `sheetEdited` の処理を確認する。
3. `npm run apps-script:deploy` 後、次の関数呼び出しから更新後のコードが動くことを確認する。

デプロイ時の動的ソース更新はサービスアカウントで実行できる。Apps Script 実機での委譲処理は未確認。また、実行時に Drive の取得が失敗するとシート上の処理も失敗する。ソースを動的に実行するため、Drive ファイルの編集権限はデプロイ用アカウントと管理者に限定する。
