/**
 * 将不合法json字符串转换成对象
 * @param str
 * @returns
 */
export const strParse = (str: string): any => {
    return JSON.parse(str.replace(/(\w+)\s*:/g, (_, p1) => `"${p1}":`).replace(/\'/g, "\"").replace(/\s*\n*/g, '').replace(/\,\}/g, '}').replace(/\,\]/g, ']'));
};