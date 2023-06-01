import { window } from "vscode";
import * as t from "@babel/types";
import generate from "@babel/generator";
import traverse, { NodePath, Visitor } from "@babel/traverse";
import { ParseResult, parse } from "@babel/parser";
import { BaseClass } from "./BaseClass";
import { IMain } from "./interface/Main.interface";
import { Logger } from "./Logger";
import { ErrorEnum } from "./interface/Logger.interface";
import { CustomConfig, Icomments } from "./constant";

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

  private newVarible: Map<string, string>;
  private varibleNames: Map<string, number>;
  constructor() {
    super();
    this.newVarible = new Map([]);
    this.varibleNames = new Map([]);
  }

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
    } catch (error: any) {
      Logger.error({
        type: ErrorEnum.UNKNOWN_MISTAKE,
        data: error.message,
        items: ["OpenIssue"],
      });
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
  // API TO TS
  // *********************

  apiToTs(code: string) {
    try {
      const tsCode = this.parseCode(code);
      return tsCode;
    } catch (error: any) {
      Logger.error({
        type: ErrorEnum.UNKNOWN_MISTAKE,
        data: error.message,
        items: ["OpenIssue"],
      });
      return error.message;
    }
  }

  // *********************
  // JS To TS
  // *********************

  async jsToTs() {
    try {
      const activeEditor = window.activeTextEditor;
      if (!activeEditor) {
        return;
      }

      const selectData = this.getSelectedInfo();
      if (selectData.length) {
        selectData.forEach(async (item) => {
          const { text, range } = item;
          let updateText = text;
          if (range.start === range.end) {
            // 不是选择区域时，从剪切板获取内容
            updateText = await this.getCodeByClipboard();
          }
          const code = this.parseCode(updateText);

          // 是否打开临时文件展示内容
          const openTemporaryFile = this.getConfig(
            CustomConfig.OPEN_TEMPORARY_FILE
          ) as boolean;

          if (openTemporaryFile) {
            this.openTemporaryFile(code);
          } else {
            activeEditor.edit((editorContext) =>
              editorContext.replace(range, code)
            );
          }
        });
      } else {
        this.updateCodeByClipboard();
      }
    } catch (error: any) {
      Logger.error({
        type: ErrorEnum.UNKNOWN_MISTAKE,
        data: error.message,
        items: ["OpenIssue"],
      });
    }
  }

  // *********************
  // Parse
  // *********************

  parseCode(text: string): string {
    this.newVarible.clear();
    this.varibleNames.clear();
    const regular = /(var|let|const)\s*(\w+)\s*=.*/;
    let updateText = text;
    let variableName = updateText.match(regular)?.[2];
    // 判断是否存在变量
    if (!variableName) {
      // 不能存在分号
      variableName = variableName || `RootObject`;
      updateText = `const ${variableName} = ${updateText}`
        .trimRight()
        .replace(/;$/, "");
    }
    this.varibleNames.set(variableName, 0);

    const ast: ParseResult<t.File> = parse(updateText, {
      plugins: ["typescript"],
    });

    this.traverseCode(ast, variableName);
    const code = generate(ast).code;
    return code;
  }

  // *********************
  // Traverse
  // *********************

  // TODO: 暂未优化 (后续单独成拆成一个npm包 - 二进制包)
  traverseCode(ast: ParseResult<t.File>, parentName: string) {
    const declaration = (ast.program.body[0] as t.VariableDeclaration)
      .declarations[0];
    const type = declaration!.init!.type;
    if (type === AstTypeEnum.objectExpression) {
      traverse(ast, this.ObjectVisitor, undefined, { parentName });
    } else if (type === AstTypeEnum.arrayExpression) {
      traverse(ast, this.ArrayVisitor, undefined, { parentName });
    }
    traverse(ast, this.VariableVisitor);
  }

  // *********************
  // Visitor
  // *********************

  /** 对象Visitor */
  get ObjectVisitor(): Visitor<t.Node> {
    const _that = this;
    const prefix = this.getConfig(CustomConfig.PREFIX) as string;
    return {
      ObjectProperty(path: NodePath<t.ObjectProperty>, state: any = {}) {
        const value = path.node.value;
        let key = path.node.key;
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
          } else {
            typeAnnotation = t.tsTypeReference(t.identifier(calleeName));
          }
        } else if (t.isCallExpression(value)) {
          const calleeName = generate((value as t.CallExpression).callee).code;
          typeAnnotation = t.tsTypeReference(t.identifier(calleeName));
        } else if (t.isArrowFunctionExpression(value)) {
          // TODO: 未完成
          // typeAnnotation = t.tsFunctionType(null, []);
        } else if (t.isArrayExpression(value)) {
          if (value.elements.length) {
            const id = _that.getID(key);

            // 元素类型只存在基础类型，不生成新的interface定义
            const complexTypes = value.elements.some(
              (element) => !(t.isLiteral(element) || t.isIdentifier(element) || t.isUnaryExpression(element))
            );

            if (complexTypes) {
              const originparentName = state.parentName;
              state.parentName = id;
              path.get("value").traverse(_that.ArrayVisitor, state);
              state.parentName = originparentName;

              // 类型去重
              let elements = (path.node.value as t.ArrayExpression).elements;
              const updateElements = _that.typeIntegration(elements) as t.ArrayExpression['elements'];
              (path.node.value as t.ArrayExpression).elements = updateElements;

              // TODO: 判断合并之后的数组对象是否跟父类型一致，一致则不在产生新数据
              if (!(value.elements.length === 1 &&
                t.isTSTypeLiteral(updateElements[0]) &&
                _that.isALLKeySame(path.get("value") as NodePath<t.ArrayExpression>))) {

                // 生成一个新的变量(判断是否存在一样的数据)
                const variableExpression = generate(path.node.value).code;
                const reusableId = _that.reusableById(id, variableExpression);

                if (!reusableId) {
                  const variable = t.variableDeclaration("const", [
                    t.variableDeclarator(
                      t.identifier(id),
                      path.node.value as t.ArrayExpression
                    ),
                  ]);
                  const programNode = path.findParent((path) =>
                    path.isProgram()
                  )!;
                  (programNode.node as t.Program).body.splice(1, 0, variable);
                }
                typeAnnotation = t.tsTypeReference(
                  t.identifier(`Array<${prefix}${reusableId ?? id}>`)
                );
              } else {
                typeAnnotation = t.tsTypeReference(
                  t.identifier(`Array<${prefix}${state.parentName}>`)
                );
              }
            } else {
              // 基础类型
              path.get("value").traverse(_that.ArrayVisitor, state);

              // 类型去重
              let elements = (path.node.value as t.ArrayExpression).elements;
              (path.node.value as t.ArrayExpression).elements = _that.typeIntegration(elements) as t.ArrayExpression['elements'];

              typeAnnotation = t.tsArrayType(
                t.tsUnionType(
                  (path.node.value as t.ArrayExpression)
                    .elements as unknown as t.TSType[]
                )
              );
            }
          } else {
            typeAnnotation = t.tsTypeReference(t.identifier(`Array<unknown>`));
          }
          path.skip();
        } else if (t.isObjectExpression(value)) {
          if (_that.isALLKeySame(path)) {
            const name = state.parentName;
            typeAnnotation = t.tsTypeReference(t.identifier(`${prefix}${name}`));
          } else {
            const id = _that.getID(key);
            const originparentName = state.parentName;
            state.parentName = id;
            path.get("value").traverse(_that.ObjectVisitor, state);
            state.parentName = originparentName;

            // 生成一个新的变量(判断是否存在一样的数据)
            const variableExpression = generate(path.node.value).code;
            const reusableId = _that.reusableById(id, variableExpression);

            if (!reusableId) {
              // 生成一个新的变量
              const variable = t.variableDeclaration("const", [
                t.variableDeclarator(
                  t.identifier(id),
                  path.node.value as t.ObjectExpression
                ),
              ]);
              const programNode = path.findParent((path) => path.isProgram())!;
              (programNode.node as t.Program).body.splice(1, 0, variable);
            }

            typeAnnotation = t.tsTypeReference(t.identifier(`${prefix}${reusableId ?? id}`));
          }

          path.skip();
        }

        if (!(key as t.Identifier)?.name) {
          // 判断类型声明是不是复杂名称，例如包含了-
          const regular = /[^(\w|_|$)]/g;
          const value = (key as t.StringLiteral).value;
          if (!regular.test(value)) {
            // 不是复杂类型转换为Identifier
            key = t.identifier(value);
          }
        }

        const node = t.tsPropertySignature(
          key as t.Expression,
          t.tsTypeAnnotation(typeAnnotation)
        );

        // 属性是否为可选
        const optional = _that.getConfig(CustomConfig.OPTIONAL) as boolean;
        node.optional = optional;

        path.replaceWith(node);
        // 是否保留注释
        _that.retainComments(path);

      },
    };
  }

  /** 数组处理 */
  get ArrayVisitor(): any {
    const _that = this;
    const prefix = this.getConfig(CustomConfig.PREFIX) as string;
    return {
      ObjectExpression(path: NodePath<t.ObjectExpression>, state: any = {}) {
        const originparentName = state.parentName;
        state.parentName = state.parentName;
        path.traverse(_that.ObjectVisitor, state);
        state.parentName = originparentName;
        path.replaceWith(
          t.tsTypeLiteral(
            path.node.properties as unknown as t.TSTypeElement[]
          )
        );
        path.skip();
      },
      ArrayExpression(path: NodePath<t.ArrayExpression>, state: any = {}) {
        // 判断最外层是否为数组
        if (path.parent.type !== "VariableDeclarator") {
          if (path.node.elements.length) {
            path.traverse(_that.ArrayVisitor, state);
            // 类型去重
            let elements = (path.node as t.ArrayExpression).elements;
            (path.node as t.ArrayExpression).elements = _that.typeIntegration(elements) as t.ArrayExpression['elements'];

            path.replaceWith(
              t.tsArrayType(
                t.tsUnionType(path.node.elements as unknown as t.TSType[])
              )
            );
          } else {
            path.replaceWith(t.tsArrayType(t.tsUnknownKeyword()));
          }
        } else {
          if (path.node.elements.length) {
            path.traverse(_that.ArrayVisitor, state);
            // 类型去重
            let elements = (path.node as t.ArrayExpression).elements;
            (path.node as t.ArrayExpression).elements = _that.typeIntegration(elements) as t.ArrayExpression['elements'];
          }
        }
        path.skip();
      },
      "StringLiteral|TemplateLiteral"(
        path: NodePath<t.Literal>,
      ) {
        path.replaceWith(t.tsStringKeyword());
        // 是否保留注释
        _that.retainComments(path);
      },
      "NumericLiteral|BigIntLiteral|DecimalLiteral"(
        path: NodePath<t.Literal>,
      ) {
        path.replaceWith(t.tsNumberKeyword());
        // 是否保留注释
        _that.retainComments(path);
      },
      UnaryExpression(
        path: NodePath<t.UnaryExpression>,
      ) {
        // TODO: UnaryExpression未穷举完所有情况
        path.replaceWith(t.tsNumberKeyword());
        // 是否保留注释
        _that.retainComments(path);
      },
      BooleanLiteral(path: NodePath<t.BooleanLiteral>) {
        path.replaceWith(t.tsBooleanKeyword());
        // 是否保留注释
        _that.retainComments(path);
      },
      NullLiteral(path: NodePath<t.NullLiteral>) {
        path.replaceWith(t.tsNullKeyword());
        // 是否保留注释
        _that.retainComments(path);
      },
      Identifier(path: NodePath<t.Identifier>) {
        if (path.parent.type !== "VariableDeclarator") {
          if (path.node.name === "undefined") {
            path.replaceWith(t.tsUndefinedKeyword());
          } else {
            path.replaceWith(t.tsUnknownKeyword());
          }
          // 是否保留注释
          _that.retainComments(path);
        }
      },
    };
  }

  /** 变量处理 */
  get VariableVisitor(): Visitor<t.Node> {
    const _that = this;
    const prefix = this.getConfig(CustomConfig.PREFIX) as string;
    return {
      VariableDeclaration(path: NodePath<t.VariableDeclaration>) {
        // 是否追加export
        const exportType = _that.getConfig(CustomConfig.EXPORT_TYPE) as boolean;

        let declarations = path.node.declarations
          .map((declaration) => {
            const name = (declaration.id as t.Identifier).name;
            if (t.isObjectExpression(declaration.init)) {
              const tsDeclaration = t.tsInterfaceDeclaration(
                t.identifier(`${prefix}${name}`),
                null,
                null,
                t.tsInterfaceBody(
                  (declaration.init as t.ObjectExpression)
                    .properties as unknown as Array<t.TSTypeElement>
                )
              );
              if (exportType) {
                return t.exportNamedDeclaration(tsDeclaration, []);
              }
              return tsDeclaration;
            } else if (t.isArrayExpression(declaration.init)) {
              // 判断是不是原始数组
              const isOriginalArray = !name.startsWith(`${prefix}`);
              let elements = (declaration.init as t.ArrayExpression).elements;
              let typeAnnotation: t.TSType = elements.length
                ? t.tSUnionType(elements as unknown as Array<t.TSType>)
                : t.tsUnknownKeyword();

              // 判断存在问题
              // if (isOriginalArray) {
              //   typeAnnotation = t.tsArrayType(typeAnnotation);
              // }

              const tsDeclaration = t.tsTypeAliasDeclaration(
                t.identifier(`${prefix}${name}`),
                null,
                typeAnnotation
              );

              if (exportType) {
                return t.exportNamedDeclaration(tsDeclaration, []);
              }
              return tsDeclaration;
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
  // Utils Function
  // *********************

  /** 父子key是否一致 */
  isALLKeySame(
    path: NodePath<t.ObjectProperty | t.ObjectExpression | t.ArrayExpression>
  ): boolean {
    // 找到最近一个父节点为"ObjectExpression"的Node
    const parentObject = path.findParent((path) => path.isObjectExpression());
    const parentProps =
      (parentObject?.node as t.ObjectExpression).properties ?? [];

    let childNode = path.node as t.ObjectExpression;
    let childProps = childNode.properties ?? [];
    if (path.node.type === "ObjectProperty") {
      childProps = (path.node.value as t.ObjectExpression).properties ?? [];
    } else if (path.node.type === "ArrayExpression") {
      const element = path.node.elements[0];
      if (t.isTSTypeLiteral(element)) {
        childProps = ((element as t.TSTypeLiteral).members ?? []) as any;
      } else {
        childProps = (element as t.ObjectExpression).properties ?? [];
      }
    }

    // 获取到所有的key
    const parentKeys = parentProps.map(
      (props) => {
        const key = (props as t.ObjectProperty).key;
        if (t.isIdentifier(key)) {
          return key.name;
        } else if (t.isStringLiteral(key)) {
          return key.value;
        }
      }
    );
    const childKeys = childProps.map(
      (props) => {
        const key = (props as t.ObjectProperty).key;
        if (t.isIdentifier(key)) {
          return key.name;
        } else if (t.isStringLiteral(key)) {
          return key.value;
        }
      }
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

  /** 从剪切板更新内容 */
  async updateCodeByClipboard() {
    // 从粘贴板获取内容
    const code = await this.getCodeByClipboard();
    const updateCode = this.parseCode(code);
    this.openTemporaryFile(updateCode);
  }

  /** 数组对象类型整合 */
  // TODO： 类型未定义
  typeIntegration(elements: Array<any>): Array<any> {
    // 对象数据数据整合在一起成为联合类型
    const typeMap: Map<string, Array<any>> = new Map([]);
    // 基础类型
    const basics: Array<any> = [];
    // 复杂类型
    const complexs: Array<any> = [];
    elements.forEach(element => {
      if (t.isTSTypeLiteral(element)) {
        complexs.push(element);
      } else {
        basics.push(element);
      }
    });

    if (complexs.length < 2) { return this.deduplication(elements); }

    for (let complex of complexs) {
      for (let member of complex!.members) {
        const key = generate((member as t.TSPropertySignature).key).code;
        const typeAnnotations: Array<t.TSTypeAnnotation> = typeMap.get(key) ?? [];
        typeMap.set(key, [...typeAnnotations, member.typeAnnotation?.typeAnnotation] as Array<t.TSTypeAnnotation>);
      }
    }

    const updateNode = [];
    if (typeMap.size) {
      for (let [key, value] of typeMap) {
        let uniqueValue = this.deduplication(value);
        const node = t.tsPropertySignature(
          t.identifier(key),
          t.tsTypeAnnotation(t.tsUnionType(uniqueValue as any as t.TSType[]))
        );

        // 属性是否为可选
        const optional = this.getConfig(CustomConfig.OPTIONAL) as boolean;
        // 如果配置的是false, 那么需要主动判断某个类型是否为可选类型
        const isOptional = value.length !== complexs.length;
        node.optional = optional || isOptional;

        updateNode.push(node);
      }
    }

    // 将对象类型，组合成一个新类型
    return [...this.deduplication(basics), t.tsTypeLiteral(updateNode)];
  }

  /** 类型是否可复用 */
  reusableById(originId: string, code: string): string | undefined {
    if (this.newVarible.size) {
      // 判断是否有可复用的类型
      for (let [id, expression] of this.newVarible.entries()) {
        if (expression === code) {
          return id;
        }
      }
    }
    this.newVarible.set(originId, code);
  }

  /** 去重 */
  deduplication(value: Array<t.Expression | t.SpreadElement | null>) {
    if (value.length > 1) {
      const unique: Set<string> = new Set([]);
      const uniqueValue = value.reduce((types, data: any) => {
        if (data.type === "TSTypeReference") {
          const name = data.typeName.name;
          if (!unique.has(name)) {
            unique.add(name);
            types.push(data);
          }
        } else {
          if (!unique.has(data.type)) {
            unique.add(data.type);
            types.push(data);
          }
        }
        return types;
      }, [] as t.TSTypeAnnotation[]);
      return uniqueValue;
    }
    return value;
  }

  /** 获取到id */
  getID(key: t.PrivateName | t.Expression) {
    let id = (key as t.Identifier)?.name ?? (key as t.StringLiteral)?.value;
    id = `${id.charAt(0).toUpperCase()}${id.slice(1)}`;
    let updateId = id;
    if (this.varibleNames.has(id)) {
      const index = (this.varibleNames.get(id) ?? 0) + 1;
      updateId = `${id}${index}`;
      this.varibleNames.set(id, index);
    } else {
      this.varibleNames.set(id, 0);
    }
    return updateId;
  }

  /** 是否保留注释 */
  retainComments(path: NodePath<any>) {
    // 是否保留注释
    const comments = this.getConfig(CustomConfig.COMMENTS) as string;

    switch (comments) {
      case Icomments.NONE: {
        path.node.leadingComments = null;
        path.node.innerComments = null;
        path.node.trailingComments = null;
        break;
      }
      case Icomments.LEADING_COMMENTS: {
        path.node.innerComments = null;
        path.node.trailingComments = null;
        break;
      }
      case Icomments.INNER_COMMENTS: {
        path.node.leadingComments = null;
        path.node.trailingComments = null;
        break;
      }
      case Icomments.TRAILING_COMMENTS: {
        path.node.leadingComments = null;
        path.node.innerComments = null;
        break;
      }
    }

  }
}
