/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SheetDate } from './SheetDate.js';
export type Round = {
    id: string;
    name: string;
    description: string;
    start_date: SheetDate;
    end_date: SheetDate;
    status: Round.status;
};
export namespace Round {
    export enum status {
        PLANNED = 'Planned',
        ACTIVE = 'Active',
        CLOSED = 'Closed',
    }
}
