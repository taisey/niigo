/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MemberInput } from './MemberInput.js';
export type SaveMemberRequest = {
    name: SaveMemberRequest.name;
    item: MemberInput;
    expected: string;
};
export namespace SaveMemberRequest {
    export enum name {
        MEMBERS = 'Members',
    }
}
