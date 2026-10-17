/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CloseRoundRequest = {
    roundId: string;
    /**
     * 未完了タスクの ID をキー、移動先ラウンドの ID または空文字列を値にする。
     */
    destinations: Record<string, string>;
    /**
     * 取得したラウンドを JSON.stringify した文字列。
     */
    expected: string;
};
