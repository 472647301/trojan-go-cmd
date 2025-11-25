/** 0-未安装、1-安装中、2-卸载中、3-已安装未启动、4-已安装已启动 */
export enum statusEnum {
  NotInstalled,
  InstallationInProgress,
  Uninstalling,
  NotStarted,
  Started
}

export const statusText: Record<number, string> = {
  [statusEnum.NotInstalled]: '未安装',
  [statusEnum.InstallationInProgress]: '安装中',
  [statusEnum.Uninstalling]: '卸载中',
  [statusEnum.NotStarted]: '已安装未启动',
  [statusEnum.Started]: '已安装已启动'
}
