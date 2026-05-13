先compress context，但是原话记住我接下来的prompt

我正策划全新的UI和功能。
让Parallaxer不止是为多图双显服务，而是1、2、3甚至更多显示器-图像映射组
菜单栏+侧边栏+工作区的形式，就像codex的界面一样，见截图

## 菜单栏
从左至右：折叠/展开侧边栏 File Edit Help 置左 最小化 最大化 关闭置右

## 侧边栏

侧边栏Sidebar我需要一个定义式的控件定义方式，只需要4个prop：
1、HeadButtons:{icon?:string,title:string,hoverTip:string悬浮时效果见P3,key:string被点击时emit出来}[],控制顶部的几个按钮
2、BodyLists:{title:string,placeholder:string空列表时的内容,key:string,actions:Action[]悬浮时展示的在末尾的按钮}[]
3、TailButtons:same as HeadButtons
4、ListItems:{selected:boolean, head?:Action,hoverHead?:Action,title:string,tail:string|Action,hoverTail:string文字|Action[]按钮}[]

Action:{key?:string,hoverTip?:string,icon:string}有key时被视为可点击的，鼠标悬浮在action上时高光
action的好处是，一些地方可能是图标也可能是按钮，只需要不填写key就不会被当作按钮

四个emit
emit_name | 传出
HeadButtonClicked buttonKey
ListButtonClicked listKey itemKey? actionKey， itemKey null时视作点击了listtitle右侧的那些按钮
ListSelectionChanged listKey itemKey
TailButtonClicked buttonKey

就像codex的界面一样,只不过左边不是Projects,Chats...而是“Monitors[action:Refresh]”，“Configurations[action:Refresh,New]”，“Playlists[action:Refresh,Open]”的List，上方不是New chat，search，skills...而是New Config，New Playlist，底下依旧是setting。得益于Sidebar的设计，只要在外部控制那四个props就能轻松控制这些东西了！

需要可以调整宽度，超过最小宽度时自动折叠，我不知道codex的折叠效果是怎么写的，不过看起来是侧边栏的内容渐隐，然后被工作区盖上去

## 工作区
lt lb有圆角，占用侧边栏剩余的横向空间
提供slot放置主要内容

prop
title:string显示在左上角
actions:Action[]显示在右上角



你可能已经注意到了我的关键组件侧边栏都是定义式展示UI+emit用户意图，也就意味着大量控制器可能会出现在主页vue里，你可以用一些状态管理以免大量代码都在主页里

选中显示器时控制工作区标题显示显示器名称，主内容就是配置屏幕，屏幕配置需要建立在某种显示器的唯一设备id索引之上，在此之上用户可以自己配置该显示器的人类友好名称、展示显示器的基本信息，EDID？

选中配置时控制工作区标题显示配置名称,action提供一个save按钮，主内容就是从上至下布局：配置名称、描述、一个横向布局排布了这个配置文件中定义了的屏幕的单选可选中卡片，最开头有一个特殊的9:16卡片，中间只有一个大加号表示增加显示器，点击卡片后弹出悬浮的列表，可以从已有的显示器中选择（也就是MonitorList用的那个列表），每张卡片的比例和屏幕比例一样，但是占满横向布局的高，卡片里写着显示器的友好名称、唯一ID、配置范围内的唯一shortname给后面提到的“同名文件分离”功能用、尺寸、刷新率之类的（如果可以的话）

然后是分割线

接下来就是展示上面选中这块屏幕被设定的全局映射方式，也就是某个图片被传输过来默认的映射方式
1、旋转
并排放置四个按钮 0 90 180 270
2、镜像
并排放置四个按钮 无 水平 垂直 Both
未来可能还会支持缩放和位移之类的

我还需要应用拥有读写外部文件的能力。这样就能保存config到软件文件夹(tauri提供跨平台适配？~/.parallaxer/configs)里，编辑也从这里取、写，软件设置.parallaxer（包括显示器的友好名称、缓存、使用过的播放文件夹列表，~/.parallaxer/.parallaxer）也能存起来。

选中playlist的时候控制工作区标题显示playlist名称,action提供save和play按钮，主内容就从上往下布局：使用的配置文件（下拉框），映射模式（下拉框：目前就一个“同名文件分离”，意思是会自动读取以配置文件中定义的显示器的唯一ID命名的文件夹里的同名文件生成播放列表），上面这俩任意一个更新的时候立即刷新生成播放列表：

文件名 信息 可见
parallax_image.png - checkboxtick
missing_image.png missing at /monitorname1,/monitorname2...
etc

我还需要在播放列表（其实就是用户选择的文件夹）里放playlist.json，里面保存了以上内容

注意这个侧边栏的设计是非常灵活的，未来如果需要增加新的功能或者调整现有功能，只需要修改对应的props和emit就可以了。
例如未来切换到设置页不需要真的路由跳转，只需要更改sidebar的props就可以了+更改工作区的内容，甚至未来增加一个新的功能页也是一样的操作方式

