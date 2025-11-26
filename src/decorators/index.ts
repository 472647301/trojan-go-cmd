import { Type, applyDecorators, HttpStatus } from '@nestjs/common'
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger'

const baseTypeNames = ['String', 'Number', 'Boolean']

interface IApiResult<TModel extends Type> {
  type: TModel | TModel[]
  isPage?: boolean
  status?: HttpStatus
}
/**
 * @name: 生成返回结果装饰器
 * @example `@ApiResult({type: [A]})`
 */
export const ApiResult = <TModel extends Type>(params: IApiResult<TModel>) => {
  let prop: any = null

  if (Array.isArray(params.type)) {
    if (params.isPage) {
      prop = {
        type: 'object',
        properties: {
          list: {
            type: 'array',
            items: { $ref: getSchemaPath(params.type[0]) }
          },
          total: { type: 'number', default: 0 }
        }
      }
    } else {
      prop = {
        type: 'array',
        items: { $ref: getSchemaPath(params.type[0]) }
      }
    }
  } else if (params.type) {
    if (params.type && baseTypeNames.includes(params.type.name)) {
      prop = { type: params.type.name.toLocaleLowerCase() }
    } else {
      prop = { $ref: getSchemaPath(params.type) }
    }
  } else {
    prop = { type: 'null', default: null }
  }

  const model = Array.isArray(params.type) ? params.type[0] : params.type

  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status: params.status || 201,
      schema: {
        allOf: [
          {
            properties: {
              data: prop,
              code: { type: 'number', default: 0 },
              message: { type: 'string', default: 'success' }
            }
          }
        ]
      }
    })
  )
}
