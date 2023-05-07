import { window } from "vscode";
import { BaseClass } from "./BaseClass";
import { IMain } from "./interface/Main.interface";
import generate from "@babel/generator";
import * as t from "@babel/types";
import { parse, parseExpression } from "@babel/parser";
import { v4 as uuidv4 } from "uuid";
import { isArray, isObj } from './utils';
import { strParse, attributeSort } from './helper';

export enum AstTypeEnum {
  identifier = "Identifier",
  stringLiteral = "StringLiteral",
  numericLiteral = "NumericLiteral",
  booleanLiteral = "BooleanLiteral",
  nullLiteral = "NullLiteral",
  newExpression = "NewExpression",
  callExpression = "CallExpression",
  objectExpression = "ObjectExpression",
  arrayExpression = "ArrayExpression",
}

// TODO: Promise<T>
enum TsParamsEnum {
  tSTypeParameterInstantiation = "TSTypeParameterInstantiation",
  tSAnyKeyword = "tSAnyKeyword",
  tSNeverKeyword = "tSNeverKeyword",
  tSNullKeyword = "TSNullKeyword",
  tSNumberKeyword = "TSNumberKeyword",
  tSStringKeyword = "TSStringKeyword",
  tSSymbolKeyword = "TSSymbolKeyword",
  tSUndefinedKeyword = "TSUndefinedKeyword",
  tSUnknownKeyword = "TSUnknownKeyword",
  tSVoidKeyword = "TSVoidKeyword",
  tSUnionType = "TSUnionType",
  tSIntersectionType = "TSIntersectionType",
}

export class Main extends BaseClass implements IMain {
  private nameRegular = /([a-zA-Z]*)(«(?:[\w|«|»])+»)?(?:\s)*(\{)/m;
  private contentRegular = /(\w+).*\(([^,]+).*\)((?:\:)([^,|}|\r|\n]+))?/g;
  private blockRegular = /([^\{]*\{)([^\{\}]+)(\})/gm;
  private children: Array<string> = [];

  // *********************
  // Add Block Command
  // *********************

  /** 添加注释 */
  addBlockComments() {
    // TODO: 未完成
    const editor = window.activeTextEditor;
    if (editor) {
      const active = editor.selection.active;
      editor.edit((editorContext) => {
        editorContext.insert(active, `/**  */`);
      });
      this.setCursorPosition(active.line, active.character + 4);
    }
  }

  // *********************
  // Swagger To TS
  // *********************

  /** 执行转换 */
  executeConverts() {
    try {
      const selectData = this.getSelectedInfo();

      const editor = window.activeTextEditor;
      if (!editor) {
        return;
      }
      selectData.forEach((item) => {
        const { text, range } = item;
        // 将数据分为区域 ~{(第一块) {}(里面的内容第二块) }(第三块)
        let blocks = null;
        // 数据string
        let formatText = "";

        while ((blocks = this.blockRegular.exec(text))) {
          const interfaceText = this.getInterface(blocks[1]);
          const content = this.getContent(blocks[2]);
          formatText = `${formatText}
${interfaceText.trim()}${content}
}
  `;
        }
        editor.edit((editorContext) =>
          editorContext.replace(range, formatText)
        );
      });
    } catch (error) {
      console.log("error: ", error);
    }
  }

  /** 获取interface模板 */
  getInterface(text: string): string {
    const names = text.match(this.nameRegular);
    return names ? `export interface ${names[1]} ${names[3]}\n\t` : "";
  }

  /**
   * 判断当前是否为子节点
   * @param obj
   * @param key
   * @param types
   * @returns
   */
  isChild(itemTypes: any, key: string, types: any): boolean {
    const { [key]: ch, ...child } = types;
    const { [key]: val, ...item } = itemTypes;
    console.log('json', JSON.stringify(item), JSON.stringify(child));
    return JSON.stringify(item) === JSON.stringify(child);
  }

  /**
   * 过滤所有child的键
   * @param node 对象
   * @returns
   */
  filterChildKeys(node: any): Array<string> {
    const types = attributeSort(node);
    return Object.keys(node).filter((key) => {
      const value = node[key];
      if (isObj(value)) {
        return this.isChild(attributeSort(value), key, types);
      } else if (isArray(value)) {
        return value.every((item: any) => this.isChild(attributeSort(item), key, types));
      }
      return false;
    });
  }

  /**
   * 根据babel生成的字符串生成对象
   * @param str
   */
  getObjectByStr(str: string, level: number = 0): any {
    const entries = [];
    while (str.indexOf('{') !== -1) {
      let stackLen = 0;
      let left = str.indexOf('{'), right = left;
      if (left !== -1) {
        stackLen++;
      }

      while (stackLen) {
        right++;
        if (str[right] === '}') {
          stackLen--;
        } else if (str[right] === '{') {
          stackLen++;
        }
      }

      const value = this.getObjectByStr(str.slice(left + 1, right));
      str = str.slice(0, left) + str.slice(right + 1);
      while (/\W/.test(str[left])) {
        left--;
      }

      right = left + 1;
      while (str[left] !== ';' && left >= 0) {
        left--;
      }
      const key = str.slice(left + 1, right);

      str = str.slice(0, left + 1) + str.slice(right);
      entries.push([key, value]);
    }

    entries.push(...(str.split(';').map(item => item.split('?:'))).filter(item => item[0] && item[1]));
    return Object.fromEntries(entries); // 返回一个对象
  }

  /**
   * 移除接口类型名称以及注释
   */
  getInterfaceInnerText(code: string): string {
    let left = code.indexOf('{') + 1;
    // 这里需要先去除单行注释，再去除空格，最后去除多行注释
    // 暂时未排除为何不能使用/(\/\/.*\n|\/\*(.|\n)*\*\/)/一次性去除注释，该正则浏览器可正确执行
    return code.slice(left, code.length - 1).replace(/\/\/.*\n/g, '').replace(/(\n|\s)/g, '').replace(/\/\*(.|\n)*\*\//, '');
  }

  /**
   * 自调用命名
   */
  selfCallingName(code: string, name: string): string {
    const interfaceInnerText = this.getInterfaceInnerText(code); // 得到接口内部文本
    const originalObj = this.getObjectByStr(interfaceInnerText); // 根据内部文本将字符串转为对象
    this.children = this.filterChildKeys(originalObj); // 根据对象获得子节点键
    this.children.forEach((item) => {
      const len = `${item}?: `.length;
      const left = code.indexOf(`${item}?: `) + len;
      let right = left + 1;
      const stack = [code[right]];
      while (stack.length) {
        right++;
        if (['(', '[', '{'].includes(code[right])) {
          stack.push(code[right]);
        } else if ([')', ']', '}'].includes(code[right])) {
          stack.pop();
        }
      }
      code = code.replace(code.slice(left, right + 2), name);
    });
    return code;
  }

  /** 获取内容类型模板 */
  getContent(text: string): string {
    let contents = null;
    let contentText = "";
    while ((contents = this.contentRegular.exec(text))) {
      let note = contents[4] ? `/** ${contents[4].trim()} */` : "";
      const type = this.formatType(contents[2]);
      contentText = `${contentText}
  ${note}
  ${contents[1].trim()}?:${type};`;
    }
    return contentText;
  }

  /** 类型格式化 */
  formatType(type: string): string {
    if (type === "integer") {
      return "number";
    } else if (type.search(/Array/g) !== -1) {
      const mat = type.match(/(?:\[)(.*)(?:\])/);
      return mat ? mat[1] : "unknown";
    }
    return type;
  }

  // *********************
  // API TO TS
  // *********************

  apiToTs(code: string) {
    const expressionAst: any = parseExpression(code);
    let data: Array<unknown> = [];
    const type = expressionAst.type as AstTypeEnum;
    const variableName = uuidv4().slice(0, 4);
    if (type === AstTypeEnum.objectExpression) {
      data = expressionAst.properties;
    } else if (type === AstTypeEnum.arrayExpression) {
      data = expressionAst.elements;
    }
    const tsCode = this.analyzeAndGenerate(data, type, variableName);
    return tsCode;
  }

  // *********************
  // JS To TS
  // *********************

  jsToTs() {
    const selectData = this.getSelectedInfo();
    const editor = window.activeTextEditor;
    if (!editor) {
      return;
    }
    // 是否为赋值语句
    const regualar = /(var|let|const)\s*\w+\s*=.*/;

    selectData.forEach((item) => {
      const { text, range } = item;
      let type: AstTypeEnum;
      let variableName: string;
      let data: Array<unknown> = [];

      if (regualar.test(text)) {
        // TODO: 类型未定义
        const ast: any = parse(text, { plugins: ["typescript"] });
        const declaration = ast.program.body[0].declarations[0];
        variableName = declaration.id.name;
        type = declaration.init.type;

        if (type === AstTypeEnum.objectExpression) {
          data = declaration.init.properties;
        } else if (type === AstTypeEnum.arrayExpression) {
          data = declaration.init.elements;
        }
      } else {
        // 不能存在分号
        const updateText = text.trimRight().replace(/;$/, "");
        const expressionAst: any = parseExpression(updateText);
        type = expressionAst.type as AstTypeEnum;
        variableName = uuidv4().slice(0, 4);
        if (type === AstTypeEnum.objectExpression) {
          data = expressionAst.properties;
        } else if (type === AstTypeEnum.arrayExpression) {
          data = expressionAst.elements;
        }
      }
      const code = this.analyzeAndGenerate(data, type, variableName);
      const replaceText = this.selfCallingName(code, `I${variableName}`); // 启用自调用
      editor.edit((editorContext) => editorContext.replace(range, replaceText));
    });
  }

  // TODO:类型未定义
  analyzeAndGenerate(
    data: Array<any>,
    type: AstTypeEnum,
    variableName: string
  ) {
    let typeAlias = null;
    if (type === AstTypeEnum.objectExpression) {
      const typeProperties = data.map((property) => {
        const typeAnnotation = this.getTypeAnnotation(property.value);
        const propertySignatureNode = t.tsPropertySignature(
          t.identifier(property.key.name ?? property.key.value),
          t.tsTypeAnnotation(typeAnnotation)
        );
        const leadingComment = property.leadingComments;
        if (leadingComment) {
          propertySignatureNode.leadingComments = [...leadingComment];
        }
        propertySignatureNode.optional = true;
        return propertySignatureNode;
      });
      typeAlias = t.tsInterfaceDeclaration(
        t.identifier(`I${variableName}`),
        null,
        null,
        t.tsInterfaceBody(typeProperties!)
      );
    } else if (type === AstTypeEnum.arrayExpression) {
      const typeAnnotation = this.getTypeAnnotation({ elements: data, type });
      typeAlias = t.tsTypeAliasDeclaration(
        t.identifier(`I${variableName}`),
        null,
        typeAnnotation
      );
    }

    const ast = t.file(t.program([typeAlias!]));
    const code = generate(ast).code;
    return code;
  }

  getTypeAnnotation(value: any) {
    switch (value.type) {
      case AstTypeEnum.stringLiteral: {
        return t.tsStringKeyword();
      }
      case AstTypeEnum.booleanLiteral: {
        return t.tsBooleanKeyword();
      }
      case AstTypeEnum.numericLiteral: {
        return t.tsNumberKeyword();
      }
      case AstTypeEnum.nullLiteral: {
        return t.tsNullKeyword();
      }
      case AstTypeEnum.identifier: {
        if (value.name === "undefined") {
          return t.tsUndefinedKeyword();
        }
        return t.tsUnknownKeyword();
      }
      case AstTypeEnum.callExpression:
      case AstTypeEnum.newExpression: {
        const calleeName = t.isIdentifier(value.callee) && value.callee.name;
        if (calleeName) {
          if (calleeName === "Promise") {
            // TODO: 未完成
            return t.tsTypeReference(t.identifier(`${calleeName}<unknown>`));
          }
          return t.tsTypeReference(t.identifier(calleeName));
        }
        return t.tsUnknownKeyword();
      }
      case AstTypeEnum.objectExpression: {
        const properties = value.properties.map((property: any) => {
          const propertySignatureNode = t.tsPropertySignature(
            t.identifier(property.key.name ?? property.key.value),
            t.tsTypeAnnotation(this.getTypeAnnotation(property.value))
          );
          const leadingComment = property.leadingComments;
          if (leadingComment) {
            propertySignatureNode.leadingComments = [...leadingComment];
          }
          propertySignatureNode.optional = true;
          return propertySignatureNode;
        });
        return t.tsTypeLiteral(properties);
      }
      case AstTypeEnum.arrayExpression: {
        const union = new Map();
        for (const element of value.elements as Array<unknown>) {
          const elementType = this.getTypeAnnotation(element);
          union.set(elementType.type, elementType);
        }
        const unionType = t.tsUnionType(
          Array.from(union.values()) as t.TSType[]
        );
        return t.tsArrayType(unionType);
      }
    }
    // 未知类型
    return t.tsUnknownKeyword();
  }
}
