/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DataSnapshot } from '../models/DataSnapshot.js';
import type { SaveCategoryRequest } from '../models/SaveCategoryRequest.js';
import type { SaveMemberRequest } from '../models/SaveMemberRequest.js';
import type { SaveRoundRequest } from '../models/SaveRoundRequest.js';
import type { SaveTaskRequest } from '../models/SaveTaskRequest.js';
import type { CancelablePromise } from '../core/CancelablePromise.js';
import { OpenAPI } from '../core/OpenAPI.js';
import { request as __request } from '../core/request.js';
export class DataService {
    /**
     * タスク、カテゴリ、ラウンド、メンバーを取得する
     * @returns DataSnapshot 更新後または取得時点の全データ。
     * @throws ApiError
     */
    public static getData(): CancelablePromise<DataSnapshot> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/data',
            errors: {
                400: `リクエストまたはシートの内容が不正。`,
                502: `Google Sheets との通信に失敗。`,
            },
        });
    }
    /**
     * タスク、カテゴリ、ラウンド、メンバーを追加または更新する
     * item.id が空または未指定なら追加する。ID があれば、その行を更新する。
     * 更新時の expected には、取得した行を JSON.stringify した文字列を指定する。
     * 追加時は空文字列を指定する。保存直前の行と一致しない場合は 409 を返す。
     *
     * @returns DataSnapshot 更新後または取得時点の全データ。
     * @throws ApiError
     */
    public static saveEntity({
        requestBody,
    }: {
        requestBody: (SaveTaskRequest | SaveCategoryRequest | SaveRoundRequest | SaveMemberRequest),
    }): CancelablePromise<DataSnapshot> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/save',
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
