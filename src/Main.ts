import { window } from "vscode";
import { BaseClass } from "./BaseClass";
import { IMain } from "./interface/Main.interface";
import generate from "@babel/generator";
import * as t from "@babel/types";
import { v4 as uuidv4 } from "uuid";
import {
  isArray,
  isBoolean,
  isDate,
  isError,
  isNull,
  isNumber,
  isObj,
  isPromise,
  isRegExp,
  isString,
  isSymbol,
  isUndefined,
} from "./utils";

export class Main extends BaseClass implements IMain {
  private nameRegular = /([a-zA-Z]*)(«(?:[\w|«|»])+»)?(?:\s)*(\{)/m;
  private contentRegular = /(\w+).*\(([^,]+).*\)((?:\:)([^,|}|\r|\n]+))?/g;
  private blockRegular = /([^\{]*\{)([^\{\}]+)(\})/gm;

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
  // jsObject 转换为 ts
  // *********************

  jsObjectToTs() {
    const selectData = this.getSelectedInfo();
    const editor = window.activeTextEditor;
    if (!editor) {
      return;
    }
    // 获取到变量 和 对象的正则
    const regualar = /\s*(\w+)\s*=\s*((\{|\[)[\s\S]*(\}|\]))/gm;

    selectData.forEach((item) => {
      const { text, range } = item;
      const variable = /\s*(\w+)\s*=\s*[\{|\[]/;
      if (variable.test(text)) {
        const match = regualar.exec(text);
        if (match) {
          const variableName = match[1];
          const object = eval(`(${match[2]})`);
          const code = this.analyzeAndGenerate(object, variableName);
          editor.edit((editorContext) => editorContext.replace(range, code));
        }
      } else {
        // 单纯对象
        const object = eval(`(${text})`);
        const randomName = uuidv4().slice(0, 4);
        const code = this.analyzeAndGenerate(object, randomName);
        editor.edit((editorContext) => editorContext.replace(range, code));
      }
    });
  }

  analyzeAndGenerate(obj: any, name: string) {
    let typeAlias = null;
    if (isArray(obj)) {
      const typeAnnotation = this.getTypeAnnotation(obj);
      typeAlias = t.tsTypeAliasDeclaration(
        t.identifier(`I${name}`),
        null,
        typeAnnotation
      );
    } else {
      let typeProperties = Object.entries(obj).map(([key, value]) => {
        const typeAnnotation = this.getTypeAnnotation(value);
        const propertySignatureNode = t.tsPropertySignature(
          t.identifier(key),
          t.tsTypeAnnotation(typeAnnotation)
        );
        propertySignatureNode.optional = true;
        return propertySignatureNode;
      });
      typeAlias = t.tsInterfaceDeclaration(
        t.identifier(`I${name}`),
        null,
        null,
        t.tsInterfaceBody(typeProperties!)
      );
    }

    const ast = t.file(t.program([typeAlias!]));
    const code = generate(ast).code;
    return code;
  }

  getTypeAnnotation(value: unknown): any {
    if (isArray(value)) {
      // $ 去重操作
      const union = new Map();
      for (const element of value as Array<unknown>) {
        const elementType = this.getTypeAnnotation(element);
        union.set(elementType.type, elementType);
      }
      const unionType = t.tsUnionType(Array.from(union.values()) as t.TSType[]);
      return t.tsArrayType(unionType);
    }

    if (isObj(value)) {
      const properties = Object.entries(value as Record<string, unknown>).map(
        ([key, val]) => {
          const propertySignatureNode = t.tsPropertySignature(
            t.identifier(key),
            t.tsTypeAnnotation(this.getTypeAnnotation(val))
          );
          propertySignatureNode.optional = true;
          return propertySignatureNode;
        }
      );
      return t.tsTypeLiteral(properties);
    }

    if (isString(value)) {
      return t.tsStringKeyword();
    }

    if (isBoolean(value)) {
      return t.tsBooleanKeyword();
    }

    if (isNumber(value)) {
      return t.tsNumberKeyword();
    }

    if (isNull(value)) {
      return t.tsNullKeyword();
    }

    if (isUndefined(value)) {
      return t.tsUndefinedKeyword();
    }

    if (isSymbol(value)) {
      return t.tSSymbolKeyword();
    }

    if (isDate(value)) {
      return t.tsTypeReference(t.identifier("Date"));
    }

    if (isRegExp(value)) {
      return t.tsTypeReference(t.identifier("RegExp"));
    }

    if (isError(value)) {
      return t.tsTypeReference(t.identifier("Error"));
    }

    // 未知类型
    return t.tsUnknownKeyword();
  }
}
