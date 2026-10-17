/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RoundInput } from './RoundInput.js';
export type SaveRoundRequest = {
    name: SaveRoundRequest.name;
    item: RoundInput;
    expected: string;
};
export namespace SaveRoundRequest {
    export enum name {
        ROUNDS = 'Rounds',
    }
}
