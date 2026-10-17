/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CategoryInput } from './CategoryInput.js';
export type SaveCategoryRequest = {
    name: SaveCategoryRequest.name;
    item: CategoryInput;
    expected: string;
};
export namespace SaveCategoryRequest {
    export enum name {
        CATEGORIES = 'Categories',
    }
}
