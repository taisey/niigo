/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CloseRoundRequest } from '../models/CloseRoundRequest.js';
import type { DataSnapshot } from '../models/DataSnapshot.js';
import type { CancelablePromise } from '../core/CancelablePromise.js';
import { OpenAPI } from '../core/OpenAPI.js';
import { request as __request } from '../core/request.js';
export class RoundsService {
    /**
     * ラウンドを終了し、未完了タスクを移動する
     * 対象ラウンドの未完了タスクをすべて destinations に含める。
     * 移動先は終了していない別のラウンドの ID、またはラウンドから外す場合は空文字列。
     * expected には、取得したラウンドを JSON.stringify した文字列を指定する。
     *
     * @returns DataSnapshot 更新後または取得時点の全データ。
     * @throws ApiError
     */
    public static closeRound({
        requestBody,
    }: {
        requestBody: CloseRoundRequest,
    }): CancelablePromise<DataSnapshot> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/rounds/close',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `リクエストまたはシートの内容が不正。`,
                409: `対象の行が更新または削除されている。`,
                502: `Google Sheets との通信に失敗。`,
            },
        });
    }
}
