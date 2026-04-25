// 站点设置(首页 banner / 公告等)
import { callCloud } from './client';

export interface HomeBanner {
  title: string;
  subtitle: string;
}

export async function getHomeBanner(): Promise<HomeBanner> {
  const r = await callCloud<{ banner: HomeBanner }>('getHomeBanner', {});
  return r.banner;
}

export async function updateHomeBanner(input: HomeBanner): Promise<HomeBanner> {
  const r = await callCloud<{ banner: HomeBanner }>('_admin/updateHomeBanner', input);
  return r.banner;
}
