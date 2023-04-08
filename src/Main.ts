import { window } from "vscode";
import { BaseClass } from "./BaseClass";
import { IMain } from "./interface/Main.interface";
import generate from "@babel/generator";
import * as t from "@babel/types";
import { parse, parseExpression } from "@babel/parser";
import { v4 as uuidv4 } from "uuid";

enum AstTypeEnum {
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
  // Js To Ts
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
        console.log("regualar.test(text): 121", regualar.test(text));
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
        console.log("expressionAst: ", expressionAst);
        type = expressionAst.type as AstTypeEnum;
        variableName = uuidv4().slice(0, 4);
        if (type === AstTypeEnum.objectExpression) {
          data = expressionAst.properties;
        } else if (type === AstTypeEnum.arrayExpression) {
          data = expressionAst.elements;
        }
      }
      const code = this.analyzeAndGenerate(data, type!, variableName!);
      editor.edit((editorContext) => editorContext.replace(range, code));
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
          t.identifier(property.key.name),
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
            t.identifier(property.key.name),
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
