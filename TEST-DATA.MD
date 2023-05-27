### 展示数据
```ts
const AKclown = {
  // I am AKclown
  string: "AKclown",
  number: 20,
  boolean: true,
  undefined: undefined,
  null: null,
  symbol: Symbol(),
  date: new Date(),
  regExp: new RegExp("ab+c"),
  literalRegExp: /literalRegExp/,
  error: new Error(),
  promise: new Promise(() => {}),
  callback: (a: number, b: unknown, c = 1, ...rest) => {
    console.log(a, b, rest);
  },
  array: [{ string: "AKclown" }, "AKclown", 1],
  object: {
    string: "AKclown",
    number: 20,
    boolean: true,
    undefined: undefined,
  },
};

const element = {
    id:1,
    name:'AKclown',
    children:[{
        id:2,
        name:'JS TO TS',
        children:[]
    }]
}
```

### 数据模拟

[easyMock](https://mock.presstime.cn/project/64324d7248037aa2a4ae6397)
账号: AKclown123

### 测试代码

```ts
const AKclown = {
  isString: "AKclown",
  isNumber: 20,
  isBoolean: true,
  isUndefined: undefined,
  isNull: null,
  isSymbol: Symbol(),
  isDate: new Date(),
  isRegExp: new RegExp("ab+c"),
  isLiteralRegExp: /literalRegExp/,
  isError: new Error(),
  isPromise: new Promise(() => {}),
  isCallback: (a: number, b: unknown, c = 1, ...rest) => {
    console.log(a, b, rest);
  },
  /**
   * 你是谁啊
   */
  // I am AKclown
  isArray: [
    { isString: "JS Object To Typescript" },
    "AKclown",
    1,
    1,
    [1, 3, "string"],
    true,
    undefined,
    null,
  ],
  isObject: {
    isString: "AKclown",
    isNumber: 20,
    isBoolean: true,
    isUndefined: undefined,
    isNull: null,
    isArray: [
      { title: "JS Object To Typescript" },
      "AKclown",
      1,
      [1, 3, "string"],
      true,
      undefined,
      null,
    ],
  },
};

const TEST1 = {
  /**
   * 你是谁啊
   */
  // I am AKclown
  isArray: [
    { isString: "JS Object To Typescript", isNumber: 1 },
    "AKclown",
    "AK",
    1,
    1,
    [1, 3, "string"],
    [],
    true,
    undefined,
    null,
    null,
  ],
};

const test1 = {
  a: 1,
  b: 1,
  children: {
    a: 2,
    b: 2,
    children: {},
  },
};

const test2 = {
  a: 1,
  b: 1,
  children: {
    c: 1,
    d: 1,
    children: {
      c: 2,
      d: 3,
      children: {},
    },
  },
};

const test = {
  a: 1,
  b: 1,
  children: [
    {
      a: 1,
      b: 1,
      children: [
        {
          a: 1,
          b: 1,
          children: [],
        },
      ],
    },
  ],
};

const test3 = {
  a: 1,
  b: 1,
  children: [
    {
      c: 1,
      d: 1,
      Node: [
        {
          c: 2,
          d: 2,
          Node: [],
        },
      ],
    },
  ],
};

const a = [
  {
    a: 1,
    b: 1,
    children: [
      {
        c: 1,
        d: 1,
        Node: [
          {
            c: 2,
            d: 2,
            Node: [],
          },
        ],
      },
    ],
  },
  "2",
  "3",
  1,
];

const arr = ["1", 1, undefined, { aa: "12", a: { b: 1 } }];

const AK = {
  a: 1,
  b: 1,
  children: ["1", 1, undefined],
};
```

```ts
ApiResponse«List«AKclownx»»{
    code (string, optional): 响应code,
    data (Array[AKclown], optional): 第三方返回相关数据,
    msg (string,optional): 错误信息
}
```
