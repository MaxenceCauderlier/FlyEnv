import path from 'path'
import Launcher from './Launcher'

global.__static = path.resolve(__dirname, 'static/')
global.launcher = new Launcher()
