export interface ILog {
}

// *********************
// type 
// *********************

export type ErrorType = {
    type: ErrorEnum;
    data: unknown;
    items?: Array<string>;
};
// 错误类型定义
export enum ErrorEnum {
    UNKNOWN_MISTAKE = 'UNKNOWN_MISTAKE',
}

export type WarnType = {
    type: WarnEnum;
    data: unknown;
    items?: Array<string>;
};

// 警告类型定义
export enum WarnEnum {
    ILLEGAL_INPUT_VALUE = 'ILLEGAL_INPUT_VALUE',
    FILE_OPENING_EXCEPTION = 'FILE_OPENING_EXCEPTION'
}

export type InfoType = {
    type: InfoEnum;
    data: unknown;
    items?: Array<string>;
};

// 错误类型定义
export enum InfoEnum {
    TO_SETTING = 'TO_SETTING',
}

export enum OtherEnum {
    // 主动取消输入
    VOLUNTARILY_CANCEL = 'VOLUNTARILY_CANCEL'
}