/**
 * 将不合法json字符串转换成对象
 */
export const strParse = (str: string): any => {
    return JSON.parse(str.replace(/(\w+)\s*:/g, (_, p1) => `"${p1}":`).replace(/\'/g, "\"").replace(/\s*\n*/g, '').replace(/\,(\]|\})/g, (_, p1) => p1));
};

/**
 * 将对象所有属性值转换成类型
 */
export const attributeSort = (obj: any) => {
    return Object.fromEntries(Object.entries(obj).sort());
};