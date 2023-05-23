import { window } from "vscode";
import * as t from "@babel/types";
import generate from "@babel/generator";
import traverse, { NodePath, Visitor } from "@babel/traverse";
import { ParseResult, parse, parseExpression } from "@babel/parser";
import { v4 as uuidv4 } from "uuid";
import { isArray, isObj } from "./utils";
import { attributeSort } from "./helper";
import { BaseClass } from "./BaseClass";
import { IMain } from "./interface/Main.interface";

export enum AstTypeEnum {
  identifier = "Identifier",
  stringLiteral = "StringLiteral",
  numericLiteral = "NumericLiteral",
  booleanLiteral = "BooleanLiteral",
  nullLiteral = "NullLiteral",
  templateLiteral = "TemplateLiteral",
  bigintLiteral = "BigintLiteral",
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

  // *********************
  // API TO TS
  // *********************

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

  /**
   * 判断当前是否为子节点
   */
  isChild(itemTypes: any, key: string, types: any): boolean {
    const { [key]: ch, ...child } = types;
    const { [key]: val, ...item } = itemTypes;
    return JSON.stringify(item) === JSON.stringify(child);
  }

  /**
   * 过滤所有child的键
   */
  filterChildKeys(node: any): Array<string> {
    const types = attributeSort(node);
    return Object.keys(node).filter((key) => {
      const value = node[key];
      if (isObj(value)) {
        return this.isChild(attributeSort(value), key, types);
      } else if (isArray(value)) {
        return value.every((item: any) =>
          this.isChild(attributeSort(item), key, types)
        );
      }
      return false;
    });
  }

  /**
   * 根据babel生成的字符串生成对象
   */
  getObjectByStr(str: string, level: number = 0): any {
    const entries = [];
    while (str.indexOf("{") !== -1) {
      let stackLen = 0;
      let left = str.indexOf("{"),
        right = left;
      if (left !== -1) {
        stackLen++;
      }

      while (stackLen) {
        right++;
        if (str[right] === "}") {
          stackLen--;
        } else if (str[right] === "{") {
          stackLen++;
        }
      }

      const value = this.getObjectByStr(str.slice(left + 1, right));
      str = str.slice(0, left) + str.slice(right + 1);
      while (/\W/.test(str[left])) {
        left--;
      }

      right = left + 1;
      while (str[left] !== ";" && left >= 0) {
        left--;
      }
      const key = str.slice(left + 1, right);

      str = str.slice(0, left + 1) + str.slice(right);
      entries.push([key, value]);
    }

    entries.push(
      ...str
        .split(";")
        .map((item) => item.split("?:"))
        .filter((item) => item[0] && item[1])
    );
    return Object.fromEntries(entries); // 返回一个对象
  }

  /**
   * 移除接口类型名称以及注释
   */
  getInterfaceInnerText(code: string): string {
    let left = code.indexOf("{") + 1;
    // 这里需要先去除单行注释，再去除空格，最后去除多行注释
    // 暂时未排除为何不能使用/(\/\/.*\n|\/\*(.|\n)*\*\/)/一次性去除注释，该正则浏览器可正确执行
    return code
      .slice(left, code.length - 1)
      .replace(/\/\/.*\n/g, "")
      .replace(/(\n|\s)/g, "")
      .replace(/\/\*(.|\n)*\*\//, "");
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
        if (["(", "[", "{"].includes(code[right])) {
          stack.push(code[right]);
        } else if ([")", "]", "}"].includes(code[right])) {
          stack.pop();
        }
      }
      code = code.replace(code.slice(left, right + 2), name);
    });
    return code;
  }

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
        const ast: ParseResult<t.File> = parse(text, {
          plugins: ["typescript"],
        });
        this.traverseCode(ast);

        const code = generate(ast).code;
        console.log("code: ", code);

        // const declaration = ast.program.body[0].declarations[0];
        // variableName = declaration.id.name;
        // type = declaration.init.type;

        // if (type === AstTypeEnum.objectExpression) {
        //   data = declaration.init.properties;
        // } else if (type === AstTypeEnum.arrayExpression) {
        //   data = declaration.init.elements;
        // }
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

      // const code = this.analyzeAndGenerate(data, type, variableName);
      // const replaceText = this.selfCallingName(code, `I${variableName}`); // 启用自调用
      // editor.edit((editorContext) => editorContext.replace(range, replaceText));
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

  // *********************
  // Traverse
  // *********************

  traverseCode(ast: ParseResult<t.File>) {
    traverse(ast, this.ObjectVisitor);
    console.log("ast: ", ast);
    traverse(ast, this.VariableVisitor);
  }

  // *********************
  // Visitor
  // *********************

  /** 对象Visitor */
  get ObjectVisitor(): Visitor<t.Node> {
    const _that = this;
    return {
      ObjectProperty(path: NodePath<t.ObjectProperty>, state: any = {}) {
        const key = (path.node.key as t.Identifier).name;
        const value = path.node.value;
        let typeAnnotation: t.TSType = t.tsUnknownKeyword();
        if (t.isStringLiteral(value) || t.isTemplateLiteral(value)) {
          typeAnnotation = t.tsStringKeyword();
        } else if (
          t.isBigIntLiteral(value) ||
          t.isDecimalLiteral(value) ||
          t.isNumericLiteral(value)
        ) {
          typeAnnotation = t.tsNumberKeyword();
        } else if (t.isBooleanLiteral(value)) {
          typeAnnotation = t.tsBooleanKeyword();
        } else if (t.isNullLiteral(value)) {
          typeAnnotation = t.tsNullKeyword();
        } else if (t.isRegExpLiteral(value)) {
          typeAnnotation = t.tsTypeReference(t.identifier("RegExp"));
        } else if (t.isIdentifier(value)) {
          if (value.name === "undefined") {
            typeAnnotation = t.tsUndefinedKeyword();
          } else if (value.name === "Symbol") {
            typeAnnotation = t.tsSymbolKeyword();
          }
        } else if (t.isNewExpression(value)) {
          const calleeName = generate((value as t.NewExpression).callee).code;
          if (calleeName === "Promise") {
            typeAnnotation = t.tsTypeReference(
              t.identifier(`${calleeName}<unknown>`)
            );
          }
          typeAnnotation = t.tsTypeReference(t.identifier(calleeName));
        } else if (t.isCallExpression(value)) {
          const calleeName = generate((value as t.CallExpression).callee).code;
          typeAnnotation = t.tsTypeReference(t.identifier(calleeName));
        } else if (t.isArrowFunctionExpression(value)) {
          // TODO: 未完成
          // typeAnnotation = t.tsFunctionType(null, []);
        } else if (t.isArrayExpression(value)) {
          if (value.elements.length) {
            const id = uuidv4().slice(0, 4);
            state.levelRecord = [];
            path.get("value").traverse(_that.ArrayVisitor, state);
            // 生成一个新的变量
            const variable = t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier(`I${id}`),
                path.node.value as t.ArrayExpression
              ),
            ]);
            const programNode = path.findParent((path) => path.isProgram())!;
            (programNode.node as t.Program).body.push(variable);
            typeAnnotation = t.tsTypeReference(t.identifier(`Array<I${id}>`));
          } else {
            typeAnnotation = t.tsTypeReference(t.identifier(`Array<unknown>`));
          }
          path.skip();
        } else if (t.isObjectExpression(value)) {
    

          if (_that.isALLKeySame(path)) {
            console.log('path: ', path);
            console.log("parentObject: ", path.node);
            console.log("parentObject: ", path.parent);
          } else {
            const id = uuidv4().slice(0, 4);
            path.get("value").traverse(_that.ObjectVisitor, state);
            // 生成一个新的变量
            const variable = t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier(`I${id}`),
                path.node.value as t.ObjectExpression
              ),
            ]);
            const programNode = path.findParent((path) => path.isProgram())!;
            (programNode.node as t.Program).body.push(variable);
            typeAnnotation = t.tsTypeReference(t.identifier(`I${id}`));
          }

          path.skip();
        }
        const node = t.tsPropertySignature(
          t.identifier(key),
          t.tsTypeAnnotation(typeAnnotation)
        );
        path.replaceWith(node);
      },
    };
  }

  /** 数组处理 */
  get ArrayVisitor(): any {
    const _that = this;
    return {
      ObjectExpression(path: NodePath<t.ObjectExpression>, state: any) {
        console.log("path.parent: 2", path.parent);

        path.traverse(_that.ObjectVisitor, state);
        path.replaceWith(
          t.tsTypeLiteral(path.node.properties as unknown as t.TSTypeElement[])
        );
        path.skip();
      },
      ArrayExpression(path: NodePath<t.ArrayExpression>, state: any) {
        state.levelRecord = [];
        if (path.node.elements.length) {
          path.traverse(_that.ArrayVisitor, state);
          path.replaceWith(
            t.tsArrayType(
              t.tsUnionType(path.node.elements as unknown as t.TSType[])
            )
          );
        } else {
          path.replaceWith(t.tsArrayType(t.tsUnknownKeyword()));
        }
        path.skip();
      },
      "StringLiteral|TemplateLiteral"(path: NodePath<t.Literal>, state: any) {
        if (state.levelRecord.includes("string")) {
          path.remove();
        } else {
          path.replaceWith(t.tsStringKeyword());
          state.levelRecord.push("string");
        }
      },
      "NumericLiteral|BigIntLiteral|DecimalLiteral"(
        path: NodePath<t.Literal>,
        state: any
      ) {
        if (state.levelRecord.includes("number")) {
          path.remove();
        } else {
          path.replaceWith(t.tsNumberKeyword());
          state.levelRecord.push("number");
        }
      },
      BooleanLiteral(path: NodePath<t.BooleanLiteral>, state: any) {
        if (state.levelRecord.includes("boolean")) {
          path.remove();
        } else {
          path.replaceWith(t.tsBooleanKeyword());
          state.levelRecord.push("boolean");
        }
      },
      NullLiteral(path: NodePath<t.NullLiteral>, state: any) {
        if (state.levelRecord.includes("null")) {
          path.remove();
        } else {
          path.replaceWith(t.tsNullKeyword());
          state.levelRecord.push("null");
        }
      },
      Identifier(path: NodePath<t.Identifier>, state: any) {
        if (
          path.node.name === "undefined" &&
          !state.levelRecord.includes("undefined")
        ) {
          path.replaceWith(t.tsUndefinedKeyword());
          state.levelRecord.push("undefined");
        } else if (!state.levelRecord.includes("unknown")) {
          path.replaceWith(t.tsUnknownKeyword());
          state.levelRecord.push("unknown");
        }
        path.remove();
      },
    };
  }

  /** 变量处理 */
  get VariableVisitor(): Visitor<t.Node> {
    return {
      VariableDeclaration(path: NodePath<t.VariableDeclaration>) {
        let declarations = path.node.declarations
          .map((declaration) => {
            const name = (declaration.id as t.Identifier).name;
            if (t.isObjectExpression(declaration.init)) {
              return t.tsInterfaceDeclaration(
                t.identifier(`I${name}`),
                null,
                null,
                t.tsInterfaceBody(
                  (declaration.init as t.ObjectExpression)
                    .properties as unknown as Array<t.TSTypeElement>
                )
              );
            } else if (t.isArrayExpression(declaration.init)) {
              return t.tsTypeAliasDeclaration(
                t.identifier(`${name}`),
                null,
                t.tSUnionType(
                  (declaration.init as t.ArrayExpression)
                    .elements as unknown as Array<t.TSType>
                )
              );
            }
          })
          .filter(Boolean) as Array<
          t.TSInterfaceDeclaration | t.TSTypeAliasDeclaration
        >;

        path.replaceWithMultiple(declarations);
      },
    };
  }

  // *********************
  // Utils Funtion
  // *********************
  /** 父子key是否一致 */
  isALLKeySame(path: NodePath<t.ObjectProperty>): boolean {
    // 找到最近一个父节点为"ObjectExpression"的Node
    const parentObject = path.findParent((path) => path.isObjectExpression());
    const parentProps =
      (parentObject?.node as t.ObjectExpression).properties ?? [];
    const childProps = (path.node.value as t.ObjectExpression).properties ?? [];
    // 获取到所有的key
    const parentKeys = parentProps.map(
      (props) => ((props as t.ObjectProperty).key as t.Identifier).name
    );
    const childKeys = childProps.map(
      (props) => ((props as t.ObjectProperty).key as t.Identifier).name
    );

    if (
      childKeys.length &&
      parentKeys.length === childKeys.length &&
      childKeys.every((key) => parentKeys.includes(key))
    ) {
      return true;
    }
    return false;
  }
}
