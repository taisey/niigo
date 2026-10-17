/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DataSnapshot } from '../models/DataSnapshot.js';
import type { DeleteTaskRequest } from '../models/DeleteTaskRequest.js';
import type { CancelablePromise } from '../core/CancelablePromise.js';
import { OpenAPI } from '../core/OpenAPI.js';
import { request as __request } from '../core/request.js';
export class TasksService {
    /**
     * タスクを削除する
     * @returns DataSnapshot 更新後または取得時点の全データ。
     * @throws ApiError
     */
    public static deleteTask({
        taskId,
        requestBody,
    }: {
        /**
         * 削除するタスクの ID。
         */
        taskId: string,
        requestBody: DeleteTaskRequest,
    }): CancelablePromise<DataSnapshot> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/tasks/{taskId}',
            path: {
                'taskId': taskId,
            },
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
