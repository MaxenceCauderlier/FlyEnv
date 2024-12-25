import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'dataQueue',
  typeFlag: 'memcached',
  label: 'Memcached',
  icon: import('@/svg/memcached.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 10,
  isService: true,
  isTray: true
}
export default module
