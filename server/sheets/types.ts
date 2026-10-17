export type SheetCell = {
  formattedValue?: string;
  note?: string;
};

export type SheetRow = {values?: SheetCell[]};

export type Sheet = {
  properties: {
    title: string;
    sheetId: number;
    gridProperties?: {rowCount?: number; columnCount?: number};
  };
  data?: Array<{rowData?: SheetRow[]}>;
};

export type Spreadsheet = {sheets: Sheet[]};

export type SheetsGateway = {
  read(): Promise<Spreadsheet>;
  write(requests: object[]): Promise<void>;
};
