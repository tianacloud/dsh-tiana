/**
 * Client half of the Tiana bundle.
 *
 * The panel is the Tiana product surface inside DSH:
 * - a left sub-navigation for Templates, Sites and Local projects;
 * - a Sites list for the signed-in Tiana account, without visitor analytics;
 * - the public Tiana marketplace gallery, with sandboxed previews, local
 *   clone-and-build, and a link to the hosted install flow.
 *
 * All data comes from the same-origin `/tiana/api/*` routes served by the Host
 * half (`tiana-api.js`); this module never talks to Tiana directly.
 */
window.__ModuleLoader__.load({
  id: '@tianacloud/dsh-tiana',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'tiana';
    const PANEL_ID = 'tiana';
    const ACQUISITION_SOURCE = 'dsh';
    const INSTALL_NOTICE_KEY = 'tiana.pendingInstallNotice.v1';
    const SANDBOX_PREF_KEY = 'tiana.localBuildSandbox.v1';

    function readSandboxPreference() {
      try {
        return window.localStorage.getItem(SANDBOX_PREF_KEY) !== 'off';
      } catch {
        return true;
      }
    }

    function writeSandboxPreference(enabled) {
      try {
        window.localStorage.setItem(SANDBOX_PREF_KEY, enabled ? 'on' : 'off');
        window.dispatchEvent(new CustomEvent('tiana:sandbox-pref'));
      } catch {
        // Ignore storage failures.
      }
    }
    let getActiveLocale = () => (typeof navigator !== 'undefined' && typeof navigator.language === 'string' ? navigator.language : 'en');

    function withAcquisitionSource(rawUrl) {
      if (typeof rawUrl !== 'string' || rawUrl.length === 0) return rawUrl;
      try {
        const url = new URL(rawUrl);
        if (!url.searchParams.has('_from')) {
          url.searchParams.set('_from', ACQUISITION_SOURCE);
        }
        return url.toString();
      } catch {
        return rawUrl;
      }
    }

    function readInstallNotice() {
      try {
        const raw = window.localStorage.getItem(INSTALL_NOTICE_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw);
        if (!value || typeof value.sessionId !== 'string' || typeof value.workspaceId !== 'string') return null;
        return value;
      } catch {
        return null;
      }
    }

    function rememberInstallNotice(workspace) {
      const sessionId = workspace?.dshSession?.sessionId;
      if (typeof sessionId !== 'string' || typeof workspace?.id !== 'string') return;
      try {
        window.localStorage.setItem(INSTALL_NOTICE_KEY, JSON.stringify({
          workspaceId: workspace.id,
          sessionId,
          title: workspace.title ?? 'Local project',
          directory: workspace.directory ?? '',
          createdAt: new Date().toISOString(),
        }));
        window.dispatchEvent(new CustomEvent('tiana:install-complete'));
      } catch {
        // The dialog is optional; install remains usable without storage.
      }
    }

    function clearInstallNotice() {
      try {
        window.localStorage.removeItem(INSTALL_NOTICE_KEY);
      } catch {
        // Ignore storage failures.
      }
    }

    const en = {
      panel: 'Tiana',
      'nav.label': 'Tiana sections',
      'nav.sites': 'My sites',
      'local.stopPreview': 'Stop preview',
      'local.popupBlocked': 'Allow pop-ups, then click Open preview.',
      'nav.local': 'Local projects',
      'nav.templates': 'Templates',
      'nav.footer': 'Tiana Cloud',
      'pagination.label': 'Pages',
      'pagination.previous': 'Previous page',
      'pagination.next': 'Next page',
      'pagination.page': 'Page',
      'common.close': 'Dismiss',
      'common.cancel': 'Cancel',
      'local.title': 'Local projects',
      'local.subtitle': 'Templates cloned into DSH workspaces on this machine.',
      'local.empty': 'No local projects yet',
      'local.emptyHint': 'Install a template with “Clone locally” and it will appear here.',
      'local.refresh': 'Refresh local projects',
      'local.loadError': 'Could not load local projects',
      'local.retry': 'Retry',
      'local.openPreview': 'Open preview',
      'local.startPreview': 'Start preview',
      'local.retryPreview': 'Retry preview',
      'local.building': 'Building preview…',
      'local.openSession': 'Open session',
      'local.workspace': 'DSH workspace',
      'local.created': 'Created',
      'local.count': 'local projects',
      'local.status.ready': 'Ready',
      'local.status.preparing': 'Building',
      'local.status.failed': 'Failed',
      'local.status.stopped': 'Stopped',
      'local.sandbox.confined': 'Sandboxed',
      'local.sandbox.unconfined': 'Unconfined',
      'local.sandbox.toggle': 'Sandbox build',
      'local.sandbox.toggleHint': 'Confine template build writes with the DSH sandbox.',
      'local.sandbox.unsupported': 'Sandbox is not supported on this machine',
      'sites.title': 'Sites',
      'sites.subtitle': 'Manage your Tiana web apps and the sites shared with you.',
      'sites.search': 'Search names or instance IDs',
      'sites.tab.mine': 'Your sites',
      'sites.tab.shared': 'Shared with you',
      'sites.tab.all': 'All',
      'sites.column.site': 'Site',
      'sites.column.share': 'Shared with',
      'sites.shared': 'Shared with you',
      'sites.empty': 'No sites found',
      'sites.emptyHint': 'Try another search or switch tabs.',
      'sites.count': 'sites',
      'templates.title': 'Tiana marketplace',
      'templates.subtitle': 'Pick a template, preview it, install it, or download its source.',
      'templates.search': 'Search templates',
      'templates.refresh': 'Refresh templates',
      'templates.category.all': 'All',
      'templates.installs': 'installs',
      'templates.copies': 'customizations',
      'templates.author': 'Author',
      'templates.official': 'Official',
      'templates.noCover': 'No cover',
      'templates.detail': 'Template details',
      'templates.loadingMore': 'Loading template page…',
      'templates.loadMoreError': 'Could not load this template page.',
      'templates.retryMore': 'Retry',
      'templates.allLoaded': 'Last page',
      'templates.previewUnavailable': 'Preview is unavailable for this template.',
      'templates.copyPrompt': 'Copy prompt',
      'templates.copiedPrompt': 'Prompt copied',
      'templates.promptCopyFailed': 'Automatic copy failed. Select the prompt below and copy it manually.',
      'templates.chooseInstall': 'Install template',
      'templates.installLogin': 'Sign in to install this template.',
      'templates.forkHint': 'Choose an installation method.',
      'templates.cloneTitle': 'Clone locally',
      'templates.cloneBody': 'Download the source and make it your own.',
      'templates.cloneDir': 'Target directory (optional)',
      'templates.cloneAction': 'Clone locally',
      'templates.checkingLocal': 'Checking local installs…',
      'templates.localDuplicateTitle': 'Already installed locally',
      'templates.localDuplicateBody': 'This template already has a local project. Open it, or clone another copy into a new folder.',
      'templates.openExisting': 'Open existing',
      'templates.cloneAnother': 'Clone another copy',
      'templates.newFolderName': 'New folder name',
      'templates.newFolderHint': 'Saved under ~/TianaTemplates/',
      'templates.newFolderInvalid': 'Use a single folder name without slashes.',
      'templates.duplicateOpenFailed': 'The existing local project could not be opened; open it from Tiana → Local projects.',
      'installComplete.title': 'Local install complete',
      'installComplete.path': 'Install path',
      'installComplete.body': 'The project has been cloned and registered as a DSH workspace.',
      'installComplete.teach': 'To open the preview later, use the “Preview” / “Start preview” button next to the conversation title. Starting it rebuilds when needed and then opens a new tab.',
      'installComplete.openPreview': 'Open preview',
      'installComplete.startPreview': 'Start preview',
      'installComplete.building': 'Building preview…',
      'installComplete.retry': 'Retry preview',
      'installComplete.opened': 'Preview opened in a new tab.',
      'installComplete.close': 'Got it',
      'installComplete.error': 'The local preview could not be started.',
      'installComplete.localProjects': 'You can also find it in Tiana → Local projects.',
      'templates.backToExisting': 'Back to existing',
      'templates.cloning': 'Cloning source…',
      'templates.sourceCloned': 'Source cloned.',
      'templates.workspaceCreated': 'Source cloned; DSH workspace registered.',
      'templates.workspaceFailed': 'DSH workspace registration failed.',
      'templates.dshWorkspace': 'DSH workspace',
      'templates.workspaceSwitch': 'Refresh the Harness workspace list if needed, then switch to it.',
      'templates.guidedSession': 'Guided session',
      'templates.sessionRefresh': 'Refresh the Harness sidebar, then open the new session and tell it what you want to change.',
      'templates.sessionFailed': 'The guided session could not be created.',
      'templates.sessionRenameFailed': 'The session was created, but its guiding title could not be set.',
      'templates.sessionReadyFailed': 'The titled session was created, but it could not be made visible as a session row.',
      'preview.button': 'Preview',
      'preview.building': 'Building preview…',
      'preview.start': 'Start preview',
      'preview.retry': 'Retry preview',
      'preview.failed': 'Preview failed',
      'preview.title': 'Open the Tiana cloned project preview',
      'preview.opening': 'Opening preview…',
      'templates.phaseInstalling': 'Installing dependencies…',
      'templates.phaseBuilding': 'Building cloned app…',
      'templates.phaseDatabase': 'Initializing local SQLite…',
      'templates.phaseStarting': 'Starting preview…',
      'templates.phaseReady': 'Preview ready',
      'templates.phaseFailed': 'Build failed',
      'templates.phaseStopped': 'Preview stopped',
      'templates.previewStopped': 'The local preview stopped because the Host reloaded.',
      'templates.retryBuild': 'Rebuild preview',
      'templates.localMockNote': 'Local preview runs the built clone against a local SQLite mock; Tiana files, backend functions and cloud data are not available.',
      'templates.cloneFailed': 'Could not clone the template.',
      'templates.previewOpen': 'Open preview',
      'templates.clonePath': 'Directory',
      'templates.installTianaTitle': 'Install to a Tiana space',
      'templates.installTianaBody': 'Install online and use it right away.',
      'templates.installTianaAction': 'Open web install',
      'templates.preview': 'Preview',
      'templates.install': 'Install',
      'templates.count': 'templates',
      'templates.empty': 'No templates found',
      'templates.emptyHint': 'Try another search or category.',
      'templates.footer': 'Templates from the Tiana marketplace',
      'auth.checking': 'Checking Tiana sign-in…',
      'auth.connected': 'Connected to Tiana',
      'space.label': 'Space',
      'space.loading': 'Loading spaces…',
      'space.none': 'No spaces available',
      'space.open': 'Switch space',
      'account.settings': 'Personal settings',
      'auth.loginNote': 'Sign in here directly; no terminal command is needed.',
      'auth.pendingShort': 'Continue sign-in',
      'auth.title': 'Connect Tiana',
      'auth.body': 'Sign in with your Tiana account to see your web apps and the template catalog.',
      'auth.login': 'Sign in to Tiana',
      'auth.starting': 'Starting sign-in…',
      'auth.pendingTitle': 'Finish signing in',
      'auth.pendingBody': 'Open the link below and approve access in Tiana. This panel continues automatically.',
      'auth.open': 'Open sign-in page',
      'auth.copy': 'Copy link',
      'auth.copied': 'Copied',
      'auth.waiting': 'Waiting for approval…',
      'auth.restart': 'Start over',
      'auth.cancel': 'Cancel sign-in',
      'auth.error': 'Could not sign in',
      'auth.retry': 'Retry',
      'auth.logout': 'Sign out',
      'auth.note': 'The plugin never asks for or stores your Tiana password.',
      'auth.cliMissing': 'Tiana CLI is unavailable. Re-enable the plugin so its bootstrap can install it.',
      'auth.openHint': 'The authorization page opened in a new window. If you do not see it, use the link below.',
      'auth.openFailed': 'The authorization window did not open. Copy the link below and open it in your browser.',
      'auth.manualCopy': 'Select the link below to copy it manually.',
      'auth.expired': 'The sign-in link expired. Start again.',
      'auth.denied': 'Sign-in was declined.',
      'auth.required': 'Sign in to Tiana first.',
      'sites.owned': 'Owned by you',
      'sites.sharedUnavailable': 'Shared-with-you sites are not wired yet.',
      'sites.sharedUnavailableHint': 'The Tiana CLI currently lists only your own web apps.',
      'sites.loading': 'Loading sites…',
      'sites.loadError': 'Could not load sites',
      'sites.retry': 'Retry',
      'sites.open': 'Open site',
      'sites.manage': 'Manage in Tiana Console',
      'sites.delete': 'Delete site',
      'sites.deleteTitle': 'Delete site',
      'sites.deleteBody': 'This deletes the Web instance and its current archive. Associated SQLite and Git resources are kept. This cannot be undone.',
      'sites.deleteHint': 'The site will disappear after deletion is accepted; cleanup may continue in the background.',
      'sites.deleting': 'Deleting…',
      'sites.noticeDeleted': 'Site deletion was accepted.',
      'sites.actions': 'Actions',
      'sites.refresh': 'Refresh sites',
      'sites.disabled': 'Disabled',
      'templates.loading': 'Loading templates…',
      'templates.loadError': 'Could not load templates',
      'templates.retry': 'Retry',
    };

    const zh = {
      panel: 'Tiana',
      'nav.label': 'Tiana 导航',
      'nav.sites': '我的站点',
      'local.stopPreview': '停止预览',
      'local.popupBlocked': '请允许弹出标签页，或点击打开预览。',
      'nav.local': '本地项目',
      'nav.templates': '模板',
      'nav.footer': 'Tiana Cloud',
      'common.close': '关闭',
      'common.cancel': '取消',
      'local.title': '本地项目',
      'local.subtitle': '克隆到本机 DSH 工作区的 Tiana 模板项目。',
      'local.empty': '还没有本地项目',
      'local.emptyHint': '在模板市场选择“克隆到本地”后，项目会出现在这里。',
      'local.refresh': '刷新本地项目',
      'local.loadError': '本地项目加载失败',
      'local.retry': '重试',
      'local.openPreview': '打开预览',
      'local.startPreview': '启动预览',
      'local.retryPreview': '重试预览',
      'local.building': '预览构建中…',
      'local.openSession': '打开会话',
      'local.workspace': 'DSH 工作区',
      'local.created': '创建于',
      'local.count': '个本地项目',
      'local.status.ready': '可用',
      'local.status.preparing': '构建中',
      'local.status.failed': '失败',
      'local.status.stopped': '已停止',
      'local.sandbox.confined': '沙箱构建',
      'local.sandbox.unconfined': '未启用沙箱',
      'local.sandbox.toggle': '沙箱构建',
      'local.sandbox.toggleHint': '使用 DSH 沙箱限制模板构建时的文件写入范围。',
      'local.sandbox.unsupported': '本机不支持沙箱，无法开启',
      'sites.title': '站点',
      'sites.subtitle': '管理你的 Tiana Web 应用，或查看其他人分享给你的站点。',
      'pagination.label': '分页',
      'pagination.previous': '上一页',
      'pagination.next': '下一页',
      'pagination.page': '页码',
      'sites.search': '搜索名称或实例 ID',
      'sites.tab.mine': '你的网站',
      'sites.tab.shared': '与你共享',
      'sites.tab.all': '全部',
      'sites.column.site': '站点',
      'sites.column.share': '共享对象',
      'sites.shared': '与你共享',
      'sites.empty': '没有找到站点',
      'sites.emptyHint': '换个关键词，或切换到其他标签看看。',
      'sites.count': '个站点',
      'templates.title': 'Tiana 应用市场',
      'templates.subtitle': '从市场挑选模板，预览后安装，或下载源码继续修改。',
      'templates.search': '搜索模板',
      'templates.refresh': '刷新模板',
      'templates.category.all': '全部',
      'templates.installs': '次安装',
      'templates.copies': '次定制',
      'templates.author': '作者',
      'templates.official': '官方',
      'templates.noCover': '暂无封面',
      'templates.detail': '模板详情',
      'templates.loadingMore': '正在加载模板页…',
      'templates.loadMoreError': '加载该页模板失败。',
      'templates.retryMore': '重试',
      'templates.allLoaded': '已到最后一页',
      'templates.previewUnavailable': '此模板暂不可预览。',
      'templates.copyPrompt': '复刻提示词',
      'templates.copiedPrompt': '提示词已复刻',
      'templates.promptCopyFailed': '自动复制失败，请选择下方提示词手动复刻。',
      'templates.chooseInstall': '安装模板',
      'templates.installLogin': '登录后即可安装模板。',
      'templates.forkHint': '选择一种安装方式',
      'templates.cloneTitle': '克隆到本地',
      'templates.cloneBody': '下载源码，自由修改。',
      'templates.cloneDir': '目标目录（可选）',
      'templates.cloneAction': '克隆到本地',
      'templates.checkingLocal': '正在检测本地安装…',
      'templates.localDuplicateTitle': '本地已安装该模板',
      'templates.localDuplicateBody': '这个模板已经有本地项目。可以直接打开已有项目，或在新文件夹里再克隆一份。',
      'templates.openExisting': '打开已有项目',
      'templates.cloneAnother': '再克隆一份',
      'templates.newFolderName': '新文件夹名称',
      'templates.newFolderHint': '保存到 ~/TianaTemplates/',
      'templates.newFolderInvalid': '请输入不含斜杠的单层文件夹名称。',
      'templates.duplicateOpenFailed': '已有本地项目无法打开；可以到 Tiana → 本地项目 中查看。',
      'installComplete.title': '本地安装完成',
      'installComplete.path': '安装路径',
      'installComplete.body': '项目已经克隆并注册为 DSH 工作区。',
      'installComplete.teach': '以后要再打开预览，点会话标题旁的「预览 / 启动预览」按钮；需要时会重新构建，完成后打开新标签页。',
      'installComplete.openPreview': '打开预览',
      'installComplete.startPreview': '启动预览',
      'installComplete.building': '预览构建中…',
      'installComplete.retry': '重试预览',
      'installComplete.opened': '预览已在新标签页打开。',
      'installComplete.close': '知道了',
      'installComplete.error': '本地预览启动失败。',
      'installComplete.localProjects': '也可以随时在 Tiana → 本地项目 中查看。',
      'templates.backToExisting': '返回已有项目',
      'templates.cloning': '正在克隆源码…',
      'templates.sourceCloned': '源码已克隆。',
      'templates.workspaceCreated': '源码已克隆，DSH 工作区已注册。',
      'templates.workspaceFailed': 'DSH 工作区注册失败。',
      'templates.dshWorkspace': 'DSH 工作区',
      'templates.workspaceSwitch': '如未出现，请刷新 Harness 左侧工作区列表后切换。',
      'templates.guidedSession': '引导会话',
      'templates.sessionRefresh': '刷新 Harness 侧边栏后打开新会话，直接告诉我想改什么。',
      'templates.sessionFailed': '引导会话创建失败。',
      'templates.sessionRenameFailed': '会话已创建，但引导标题设置失败。',
      'templates.sessionReadyFailed': '引导会话已创建，但空会话行标记失败。',
      'preview.button': '预览',
      'preview.building': '预览构建中…',
      'preview.start': '启动预览',
      'preview.retry': '重试预览',
      'preview.failed': '预览失败',
      'preview.title': '打开 Tiana 本地克隆项目预览',
      'preview.opening': '正在打开预览…',
      'templates.phaseInstalling': '正在安装依赖…',
      'templates.phaseBuilding': '正在构建克隆应用…',
      'templates.phaseDatabase': '正在初始化本地 SQLite…',
      'templates.phaseStarting': '正在启动预览…',
      'templates.phaseReady': '预览已就绪',
      'templates.phaseFailed': '构建失败',
      'templates.phaseStopped': '预览已停止',
      'templates.previewStopped': 'Host 重载后本地预览已停止。',
      'templates.retryBuild': '重新构建预览',
      'templates.localMockNote': '本地预览运行构建后的克隆代码，数据库使用本地 SQLite mock；Tiana 文件库、后端 Functions 和云端数据不可用。',
      'templates.cloneFailed': '模板克隆失败。',
      'templates.previewOpen': '打开预览',
      'templates.clonePath': '目录',
      'templates.installTianaTitle': '安装到 Tiana 空间',
      'templates.installTianaBody': '在线安装，直接使用。',
      'templates.installTianaAction': '打开网页版安装',
      'templates.preview': '预览',
      'templates.install': '安装',
      'templates.count': '个模板',
      'templates.empty': '没有找到模板',
      'templates.emptyHint': '换个关键词或分类试试。',
      'templates.footer': '模板来自 Tiana 应用市场',
      'auth.checking': '正在检查 Tiana 登录状态…',
      'auth.connected': '已连接 Tiana',
      'space.label': '空间',
      'space.loading': '正在加载空间…',
      'space.none': '没有可用空间',
      'space.open': '切换空间',
      'account.settings': '个人设置',
      'auth.loginNote': '直接在这里登录即可，不需要在终端执行命令。',
      'auth.pendingShort': '继续登录',
      'auth.title': '连接 Tiana 账号',
      'auth.body': '登录 Tiana 账号后查看你的 Web 应用和模板目录。',
      'auth.login': '登录 Tiana',
      'auth.starting': '正在启动登录…',
      'auth.pendingTitle': '在浏览器中完成登录',
      'auth.pendingBody': '打开下面的链接并在 Tiana 中授权。插件会自动继续检查。',
      'auth.open': '打开登录页面',
      'auth.copy': '复制链接',
      'auth.copied': '已复制',
      'auth.waiting': '等待授权…',
      'auth.restart': '重新开始',
      'auth.cancel': '取消登录',
      'auth.error': '登录失败',
      'auth.retry': '重试',
      'auth.logout': '退出登录',
      'auth.note': '插件不会索取或保存你的 Tiana 密码。',
      'auth.cliMissing': 'Tiana CLI 不可用，请重新启用插件以完成安装。',
      'auth.openHint': '授权页面已尝试在新窗口中打开。如果没有看到，请使用下面的链接。',
      'auth.openFailed': '授权窗口没有打开。请复制下面的链接，在浏览器中打开。',
      'auth.manualCopy': '也可以点击下面的链接手动选择并复制。',
      'auth.expired': '登录链接已失效，请重新开始。',
      'auth.denied': '登录被拒绝。',
      'auth.required': '请先登录 Tiana。',
      'sites.owned': '自己创建',
      'sites.sharedUnavailable': '与你共享的站点列表还未接入。',
      'sites.sharedUnavailableHint': 'Tiana CLI 当前只提供自己创建的 Web 应用列表。',
      'sites.loading': '正在加载站点…',
      'sites.loadError': '站点加载失败',
      'sites.retry': '重试',
      'sites.open': '打开站点',
      'sites.manage': '在 Tiana 控制台管理',
      'sites.delete': '删除站点',
      'sites.deleteTitle': '删除站点',
      'sites.deleteBody': '将删除 Web 实例和当前归档；关联的 SQLite、Git 资源会保留。此操作不可撤销。',
      'sites.deleteHint': '删除受理后站点会从列表消失；后台清理可能仍在继续。',
      'sites.deleting': '正在删除…',
      'sites.noticeDeleted': '站点删除已受理。',
      'sites.actions': '操作',
      'sites.refresh': '刷新站点',
      'sites.disabled': '已停用',
      'templates.loading': '正在加载模板…',
      'templates.loadError': '模板加载失败',
      'templates.retry': '重试',
    };

    const ACCENTS = {
      teal: { bg: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)' },
      blue: { bg: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)' },
      green: { bg: 'linear-gradient(135deg, #166534 0%, #22c55e 100%)' },
      navy: { bg: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)' },
      orange: { bg: 'linear-gradient(135deg, #c2410c 0%, #fb923c 100%)' },
      slate: { bg: 'linear-gradient(135deg, #334155 0%, #64748b 100%)' },
      pink: { bg: 'linear-gradient(135deg, #9d174d 0%, #ec4899 100%)' },
      violet: { bg: 'linear-gradient(135deg, #5b21b6 0%, #8b5cf6 100%)' },
      cyan: { bg: 'linear-gradient(135deg, #0e7490 0%, #06b6d4 100%)' },
      amber: { bg: 'linear-gradient(135deg, #92400e 0%, #f59e0b 100%)' },
    };

    const SITE_TABS = [
      { id: 'mine', key: 'sites.tab.mine' },
      { id: 'shared', key: 'sites.tab.shared' },
      { id: 'all', key: 'sites.tab.all' },
    ];

    const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    });

    const ACCENT_KEYS = Object.keys(ACCENTS);

    function formatDate(value) {
      if (value === null || value === undefined) return '';
      const date = typeof value === 'number'
        ? new Date(value)
        : new Date(String(value).includes('T') ? value : `${value}T12:00:00`);
      if (Number.isNaN(date.getTime())) return '';
      return DATE_FORMATTER.format(date);
    }

    function accentAt(index) {
      return ACCENT_KEYS[index % ACCENT_KEYS.length];
    }

    function mapSite(item, index) {
      const createdAt = item.created_at ?? item.createdAt ?? null;
      return {
        id: String(item.id ?? item.instance_id ?? index),
        title: item.name || item.id || 'Untitled',
        updatedAt: typeof createdAt === 'number' ? createdAt : createdAt,
        source: 'mine',
        accent: accentAt(index),
        enabled: item.enabled !== false,
        endpoint: item.endpoint ?? null,
        consoleUrl: item.console_url ? withAcquisitionSource(item.console_url) : null,
        description: item.description ?? '',
      };
    }

    function mapTemplate(item, index, categoryNames) {
      const categoryId = item.category_id === null || item.category_id === undefined
        ? 'all'
        : String(item.category_id);
      const installs = item.counters?.install_count;
      const copies = item.counters?.copy_count;
      return {
        id: String(item.name ?? item.id ?? index),
        title: item.display_name || item.name || 'Untitled',
        description: item.description || '',
        category: categoryId,
        categoryName: categoryNames?.get(categoryId) ?? '',
        author: (item.space_name || item.author?.display_name || '').trim(),
        official: item.is_official === true,
        tags: Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === 'string') : [],
        installs: typeof installs === 'string' || typeof installs === 'number' ? String(installs) : null,
        copies: typeof copies === 'string' || typeof copies === 'number' ? String(copies) : null,
        version: typeof item.version === 'string' || typeof item.version === 'number' ? String(item.version) : '',
        hasCover: typeof item.cover_url === 'string' && item.cover_url.length > 0,
        enabled: item.enabled !== false,
        accent: accentAt(index),
      };
    }

    const TEMPLATE_CATALOG_CACHE_KEY = 'tiana.templateCatalogCache.v2';
    const TEMPLATE_CATALOG_CACHE_TTL_MS = 24 * 60 * 60_000;

    function readTemplateCatalogCache() {
      try {
        const raw = window.localStorage.getItem(TEMPLATE_CATALOG_CACHE_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw);
        if (!value || !Array.isArray(value.items) || !Array.isArray(value.categories)) return null;
        if (typeof value.savedAt !== 'number' || value.savedAt + TEMPLATE_CATALOG_CACHE_TTL_MS <= Date.now()) {
          window.localStorage.removeItem(TEMPLATE_CATALOG_CACHE_KEY);
          return null;
        }
        return value;
      } catch {
        return null;
      }
    }

    function writeTemplateCatalogCache(payload) {
      try {
        window.localStorage.setItem(TEMPLATE_CATALOG_CACHE_KEY, JSON.stringify({
          items: Array.isArray(payload.items) ? payload.items : [],
          categories: Array.isArray(payload.categories) ? payload.categories : [],
          nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null,
          origin: typeof payload.origin === 'string' ? payload.origin : null,
          savedAt: Date.now(),
        }));
      } catch {
        // A full or unavailable localStorage only disables the browser cache.
      }
    }

    function templatesDataFromCache(cache) {
      if (cache === null) return null;
      const categories = cache.categories;
      const categoryNames = new Map(categories.map((item) => [String(item.id), item.name]));
      return {
        loading: false,
        loadingMore: false,
        page: 1,
        items: cache.items.map((item, index) => mapTemplate(item, index, categoryNames)),
        categories,
        nextCursor: typeof cache.nextCursor === 'string' ? cache.nextCursor : null,
        origin: typeof cache.origin === 'string' ? cache.origin : null,
        error: null,
        moreError: null,
      };
    }

    async function tianaFetch(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        cache: 'no-store',
        headers: {
          'x-tiana-plugin': '1',
          'x-tiana-locale': getActiveLocale(),
          ...(options.headers ?? {}),
        },
      });
      const text = await response.text();
      let payload = null;
      if (text.length > 0) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = null;
        }
      }
      if (!response.ok) {
        const message = payload?.error?.message ?? `Tiana request failed (${response.status}).`;
        throw Object.assign(new Error(message), { status: response.status, payload });
      }
      return payload ?? {};
    }

    function openAuthWindow(url) {
      try {
        if (typeof window === 'undefined') return null;
        const popup = window.open(url, 'tiana-auth', 'popup=yes,width=520,height=720');
        if (popup) {
          try {
            popup.opener = null;
          } catch {
            // Some browsers expose a read-only opener; the reference is still usable.
          }
        }
        return popup ?? null;
      } catch {
        return null;
      }
    }

    function openPreviewWindow(url) {
      try {
        if (typeof window === 'undefined') return null;
        const popup = window.open(url, '_blank');
        if (popup) {
          try {
            popup.opener = null;
          } catch {
            // The reference is still usable even if opener is read-only.
          }
        }
        return popup ?? null;
      } catch {
        return null;
      }
    }

    function closeAuthWindow(popup) {
      try {
        if (popup && !popup.closed) popup.close();
      } catch {
        // Closing a window we no longer own is best-effort.
      }
    }

    function selectText(element) {
      try {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        if (!selection) return;
        selection.removeAllRanges();
        selection.addRange(range);
      } catch {
        // Manual selection still works.
      }
    }

    function Icon({ name, size = 18 }) {
      const common = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        style: { display: 'block', flex: 'none' },
      };
      switch (name) {
        case 'search':
          return h('svg', common, h('circle', { cx: 11, cy: 11, r: 7 }), h('path', { d: 'm20 20-3.5-3.5' }));
        case 'plus':
          return h('svg', common, h('path', { d: 'M12 5v14M5 12h14' }));
        case 'lock':
          return h('svg', common, h('rect', { x: 5, y: 10, width: 14, height: 10, rx: 2 }), h('path', { d: 'M8 10V7a4 4 0 0 1 8 0v3' }));
        case 'users':
          return h('svg', common, h('circle', { cx: 9, cy: 8, r: 3 }), h('path', { d: 'M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.8M17.5 20a5.5 5.5 0 0 0-2.5-4.6' }));
        case 'building':
          return h('svg', common, h('path', { d: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M8 19h4' }));
        case 'grid':
          return h('svg', common, h('rect', { x: 4, y: 4, width: 6, height: 6, rx: 1 }), h('rect', { x: 14, y: 4, width: 6, height: 6, rx: 1 }), h('rect', { x: 4, y: 14, width: 6, height: 6, rx: 1 }), h('rect', { x: 14, y: 14, width: 6, height: 6, rx: 1 }));
        case 'list':
          return h('svg', common, h('path', { d: 'M8 6h12M8 12h12M8 18h12' }), h('path', { d: 'M4 6h.01M4 12h.01M4 18h.01' }));
        case 'globe':
          return h('svg', common, h('circle', { cx: 12, cy: 12, r: 8.5 }), h('path', { d: 'M3.5 12h17M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5S14.2 18.2 12 20.5C9.8 18.2 8.7 15.4 8.7 12S9.8 5.8 12 3.5Z' }));
        case 'layout':
          return h('svg', common, h('rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }), h('path', { d: 'M4 9h16M9 9v11' }));
        case 'x':
          return h('svg', common, h('path', { d: 'm6 6 12 12M18 6 6 18' }));
        case 'spark':
          return h('svg', common, h('path', { d: 'm12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z' }));
        case 'arrow':
          return h('svg', common, h('path', { d: 'M5 12h14M13 6l6 6-6 6' }));
        case 'external':
          return h('svg', common, h('path', { d: 'M14 4h6v6M20 4l-9 9M20 14v6H4V4h6' }));
        case 'settings':
          return h('svg', common, h('circle', { cx: 12, cy: 12, r: 3 }), h('path', { d: 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-2.8v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2-2 .1-.1A1.7 1.7 0 0 0 7.4 15a1.7 1.7 0 0 0-1.6-1H5.6v-2.8h.2a1.7 1.7 0 0 0 1.6-1A1.7 1.7 0 0 0 7.1 8.3L7 8.2l2-2 .1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V5h2.8v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2 2-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v2.8h-.2a1.7 1.7 0 0 0-1.6 1Z' }));
        case 'trash':
          return h('svg', common, h('path', { d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5' }));
        case 'refresh':
          return h('svg', common, h('path', { d: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7' }));
        case 'chevron':
          return h('svg', common, h('path', { d: 'm6 9 6 6 6-6' }));
        case 'check':
          return h('svg', common, h('path', { d: 'm5 12 4 4L19 6' }));
        case 'stop':
          return h('svg', common, h('rect', { x: 5, y: 5, width: 14, height: 14, rx: 2 }));
        case 'download':
          return h('svg', common, h('path', { d: 'M12 3v12M7 10l5 5 5-5M4 21h16' }));
        default:
          return null;
      }
    }

    function SiteThumb({ site, large = false }) {
      const accent = ACCENTS[site.accent] ?? ACCENTS.teal;
      const [failed, setFailed] = React.useState(false);
      const initial = typeof site.title === 'string' && site.title.trim() !== '' ? site.title.trim().slice(0, 1) : 'T';
      return h(
        'div',
        {
          className: `tiana-thumb${large ? ' tiana-thumb-large' : ''}${failed ? ' is-fallback' : ''}`,
          style: failed ? { background: accent.bg } : undefined,
          'aria-hidden': true,
        },
        failed || !site.id
          ? h('span', { className: 'tiana-site-initial' }, initial)
          : h('img', {
              className: 'tiana-site-image',
              src: `/tiana/api/site-icon?id=${encodeURIComponent(site.id)}`,
              alt: '',
              loading: 'lazy',
              decoding: 'async',
              onError: () => setFailed(true),
            }),
      );
    }

    function TemplateAuthor({ template, t }) {
      if (!template.author && !template.official) return null;
      return h(
        'div',
        { className: 'tiana-template-author' },
        h(Icon, { name: 'building', size: 13 }),
        template.author ? h('span', { className: 'tiana-template-author-label' }, t('templates.author')) : null,
        template.author
          ? h('span', { className: 'tiana-template-author-name', title: template.author }, template.author)
          : null,
        template.official
          ? h(
              'span',
              {
                className: 'tiana-template-official',
                role: 'img',
                'aria-label': t('templates.official'),
                title: t('templates.official'),
              },
              '✓',
            )
          : null,
      );
    }

    function TemplateCover({ template, t, onOpen }) {
      const accent = ACCENTS[template.accent] ?? ACCENTS.teal;
      const [broken, setBroken] = React.useState(false);
      const params = new URLSearchParams({ name: template.id });
      if (template.version) params.set('v', template.version);
      return h(
        'button',
        {
          type: 'button',
          className: 'tiana-template-cover',
          onClick: onOpen,
          'aria-label': `${t('templates.preview')} ${template.title}`,
        },
        !broken && template.hasCover
          ? h('img', {
              className: 'tiana-template-cover-img',
              src: `/tiana/api/template-cover?${params.toString()}`,
              alt: '',
              loading: 'lazy',
              onError: () => setBroken(true),
            })
          : h(
              'div',
              {
                className: 'tiana-template-cover-fallback',
                style: { background: accent.bg },
                role: 'img',
                'aria-label': t('templates.noCover'),
              },
              h('span', { className: 'tiana-template-mark' }, template.title.slice(0, 1)),
            ),
        template.categoryName ? h('span', { className: 'tiana-template-cover-badge' }, template.categoryName) : null,
      );
    }

    function SearchBox({ value, onChange, placeholder, disabled = false }) {
      return h(
        'label',
        { className: `tiana-search${disabled ? ' is-disabled' : ''}` },
        h(Icon, { name: 'search', size: 16 }),
        h('input', {
          type: 'search',
          value,
          placeholder,
          disabled,
          'aria-label': placeholder,
          onChange: (event) => onChange(event.target.value),
        }),
      );
    }

    function NavItem({ active, icon, label, onClick }) {
      return h(
        'button',
        {
          type: 'button',
          className: `tiana-nav-item${active ? ' is-active' : ''}`,
          onClick,
          'aria-current': active ? 'page' : undefined,
        },
        h(Icon, { name: icon, size: 18 }),
        h('span', null, label),
      );
    }

    function TabButton({ active, label, onClick }) {
      return h(
        'button',
        {
          type: 'button',
          className: `tiana-tab${active ? ' is-active' : ''}`,
          onClick,
          'aria-pressed': active,
        },
        label,
      );
    }

    function Notice({ text, onClose, t }) {
      return h(
        'div',
        { className: 'tiana-notice', role: 'status', 'aria-live': 'polite' },
        h('div', null, text),
        h(
          'button',
          { type: 'button', onClick: onClose, 'aria-label': t('common.close'), title: t('common.close') },
          h(Icon, { name: 'x', size: 15 }),
        ),
      );
    }

    function EmptyState({ title, hint }) {
      return h(
        'div',
        { className: 'tiana-empty' },
        h('div', { className: 'tiana-empty-icon' }, h(Icon, { name: 'search', size: 18 })),
        h('div', { className: 'tiana-empty-title' }, title),
        h('div', { className: 'tiana-empty-hint' }, hint),
      );
    }

    function Spinner() {
      return h('span', { className: 'tiana-spinner', role: 'status', 'aria-label': 'loading' });
    }

    function StateView({ title, message, retryLabel, onRetry }) {
      return h(
        'div',
        { className: 'tiana-state' },
        h('div', { className: 'tiana-empty-icon' }, h(Icon, { name: 'spark', size: 18 })),
        h('div', { className: 'tiana-state-title' }, title),
        message === undefined || message === null ? null : h('div', { className: 'tiana-state-body' }, message),
        retryLabel === undefined ? null : h(
          'button',
          { type: 'button', className: 'tiana-btn tiana-btn-ghost tiana-btn-small', onClick: onRetry },
          retryLabel,
        ),
      );
    }

    function authErrorText(t, error) {
      switch (error?.code) {
        case 'AUTH_EXPIRED':
          return t('auth.expired');
        case 'AUTH_REQUIRED':
          return t('auth.required');
        case 'AUTH_DENIED':
          return t('auth.denied');
        case 'CLI_MISSING':
          return t('auth.cliMissing');
        case 'NO_PENDING_AUTH':
          return t('auth.required');
        default:
          return error?.message || t('auth.error');
      }
    }

    function AuthGate({ t, auth, login, onStartLogin, onOpenLogin, onCopyLogin, onCancelLogin, onRetryStatus, reason, onDismiss }) {
      const loginError = login?.error ?? null;
      const cancel = onCancelLogin === undefined ? null : h(
        'button',
        { type: 'button', className: 'tiana-btn tiana-btn-ghost', onClick: onCancelLogin },
        t('auth.cancel'),
      );
      const close = onDismiss === undefined ? null : h(
        'button',
        {
          type: 'button',
          className: 'tiana-auth-close',
          onClick: onDismiss,
          'aria-label': t('common.close'),
          title: t('common.close'),
        },
        h(Icon, { name: 'x', size: 15 }),
      );

      if (auth.phase === 'checking' || auth.phase === 'starting' || login?.loading === true) {
        return h(
          'div',
          { className: 'tiana-auth-card' },
          close,
          h('div', { className: 'tiana-auth-icon' }, h(Icon, { name: 'spark', size: 22 })),
          h('h2', { className: 'tiana-auth-title' }, auth.phase === 'checking' ? t('auth.checking') : t('auth.starting')),
          h(Spinner, null),
          auth.phase === 'checking' ? null : cancel,
        );
      }

      if (auth.phase === 'error') {
        const error = auth.error ?? { message: t('auth.error') };
        return h(
          'div',
          { className: 'tiana-auth-card' },
          close,
          h('div', { className: 'tiana-auth-icon' }, h(Icon, { name: 'lock', size: 22 })),
          h('h2', { className: 'tiana-auth-title' }, t('auth.error')),
          h('p', { className: 'tiana-auth-body' }, authErrorText(t, error)),
          h('p', { className: 'tiana-auth-note' }, t('auth.loginNote')),
          h(
            'div',
            { className: 'tiana-auth-actions' },
            h(
              'button',
              { type: 'button', className: 'tiana-btn tiana-btn-primary', onClick: onStartLogin },
              t('auth.login'),
            ),
            h(
              'button',
              { type: 'button', className: 'tiana-btn tiana-btn-ghost', onClick: onRetryStatus },
              t('auth.retry'),
            ),
          ),
        );
      }

      if (auth.phase === 'pending' || (login?.verificationUri && auth.phase !== 'authenticated')) {
        return h(
          'div',
          { className: 'tiana-auth-card' },
          close,
          h('div', { className: 'tiana-auth-icon' }, h(Icon, { name: 'spark', size: 22 })),
          h('h2', { className: 'tiana-auth-title' }, t('auth.pendingTitle')),
          h('p', { className: 'tiana-auth-body' }, t('auth.pendingBody')),
          login?.openFailed === true
            ? h('div', { className: 'tiana-auth-warn' }, t('auth.openFailed'))
            : h('p', { className: 'tiana-auth-note' }, t('auth.openHint')),
          login?.verificationUri ? h(
            'div',
            { className: 'tiana-auth-link' },
            h(
              'code',
              {
                title: t('auth.manualCopy'),
                onClick: (event) => selectText(event.currentTarget),
              },
              login.verificationUri,
            ),
          ) : null,
          h(
            'div',
            { className: 'tiana-auth-actions' },
            h(
              'button',
              { type: 'button', className: 'tiana-btn tiana-btn-primary', onClick: onOpenLogin, disabled: !login?.verificationUri },
              t('auth.open'),
            ),
            h(
              'button',
              { type: 'button', className: 'tiana-btn tiana-btn-ghost', onClick: onCopyLogin, disabled: !login?.verificationUri },
              login?.copied ? t('auth.copied') : t('auth.copy'),
            ),
            cancel,
          ),
          loginError === null
            ? h('div', { className: 'tiana-auth-waiting' }, h(Spinner, null), h('span', null, t('auth.waiting')))
            : h('div', { className: 'tiana-auth-error' }, authErrorText(t, loginError)),
          loginError === null ? null : h(
            'button',
            { type: 'button', className: 'tiana-btn tiana-btn-ghost', onClick: onStartLogin },
            t('auth.restart'),
          ),
        );
      }

      return h(
        'div',
        { className: 'tiana-auth-card' },
        close,
        h('div', { className: 'tiana-auth-icon' }, h(Icon, { name: 'spark', size: 22 })),
        h('h2', { className: 'tiana-auth-title' }, t('auth.title')),
        h('p', { className: 'tiana-auth-body' }, reason ?? t('auth.body')),
        loginError === null ? null : h('div', { className: 'tiana-auth-error' }, authErrorText(t, loginError)),
        h(
          'button',
          { type: 'button', className: 'tiana-btn tiana-btn-primary', onClick: onStartLogin },
          t('auth.login'),
        ),
        h('p', { className: 'tiana-auth-note' }, t('auth.note')),
      );
    }

    function SpacePicker({ t, spaces, currentSpaceId, loading, switching, onSwitch }) {
      const [open, setOpen] = React.useState(false);
      const rootRef = React.useRef(null);
      const current = spaces.find((space) => space.tenantId === currentSpaceId) ?? null;

      React.useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
          if (!rootRef.current?.contains(event.target)) setOpen(false);
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [open]);

      const choose = (space) => {
        setOpen(false);
        if (space.tenantId !== currentSpaceId) onSwitch(space.tenantId);
      };

      return h(
        'div',
        { ref: rootRef, className: 'tiana-space-picker' },
        h(
          'button',
          {
            type: 'button',
            className: 'tiana-space-trigger',
            onClick: () => setOpen((value) => !value),
            disabled: loading || switching !== null || spaces.length === 0,
            'aria-haspopup': 'listbox',
            'aria-expanded': open,
            'aria-label': t('space.open'),
            title: current?.displayName ?? t('space.open'),
          },
          h(
            'span',
            { className: 'tiana-space-trigger-name' },
            loading ? t('space.loading') : current?.displayName ?? t('space.none'),
          ),
          switching !== null ? h(Spinner, null) : h(Icon, { name: 'chevron', size: 13 }),
        ),
        open
          ? h(
              'div',
              { className: 'tiana-space-menu', role: 'listbox', 'aria-label': t('space.open') },
              spaces.map((space) => h(
                'button',
                {
                  key: space.tenantId,
                  type: 'button',
                  role: 'option',
                  'aria-selected': space.tenantId === currentSpaceId,
                  className: `tiana-space-option${space.tenantId === currentSpaceId ? ' is-current' : ''}`,
                  onClick: () => choose(space),
                },
                h('span', { className: 'tiana-space-option-name' }, space.displayName),
                space.isDefault
                  ? h('span', { className: 'tiana-space-option-meta' }, 'default')
                  : null,
                space.tenantId === currentSpaceId
                  ? h(Icon, { name: 'check', size: 13 })
                  : null,
              ))
            )
          : null,
      );
    }

    function AccountBadge({
      t,
      auth,
      onLogout,
      onLogin,
      onCancelLogin,
      spaces,
      currentSpaceId,
      spacesLoading,
      switchingSpace,
      spaceError,
      onSwitchSpace,
      settingsUrl,
    }) {
      const connected = auth.phase === 'authenticated';
      const loginBusy = auth.phase === 'checking' || auth.phase === 'starting';
      const loginLabel = auth.phase === 'checking'
        ? t('auth.checking')
        : auth.phase === 'pending'
          ? t('auth.pendingShort')
          : t('auth.login');
      return h(
        'div',
        { className: `tiana-account${connected && spaces.length > 1 ? ' has-spaces' : ''}` },
        connected
          ? h(
              'div',
              { className: 'tiana-account-head' },
              h('span', { className: 'tiana-account-dot is-on' }),
              h('span', { className: 'tiana-account-label' }, t('auth.connected')),
              h(
                'button',
                { type: 'button', className: 'tiana-account-action', onClick: onLogout, disabled: switchingSpace !== null },
                t('auth.logout'),
              ),
            )
          : auth.phase === 'starting' || auth.phase === 'pending'
            ? h(
                'div',
                { className: 'tiana-account-head' },
                h(
                  'button',
                  { type: 'button', className: 'tiana-account-login', onClick: onLogin, disabled: loginBusy },
                  loginLabel,
                ),
                h(
                  'button',
                  { type: 'button', className: 'tiana-account-action', onClick: onCancelLogin },
                  t('auth.cancel'),
                ),
              )
            : h(
                'button',
                { type: 'button', className: 'tiana-account-login', onClick: onLogin, disabled: loginBusy },
                loginLabel,
              ),
        connected && spaces.length > 1
          ? h(
              'div',
              { className: 'tiana-space-row' },
              h('span', { className: 'tiana-space-label' }, t('space.label')),
              h(SpacePicker, {
                t,
                spaces,
                currentSpaceId,
                loading: spacesLoading,
                switching: switchingSpace,
                onSwitch: onSwitchSpace,
              }),
            )
          : null,
        spaceError ? h('p', { className: 'tiana-space-error', role: 'alert' }, spaceError.message) : null,
        connected && typeof settingsUrl === 'string' && settingsUrl.length > 0
          ? h(
              'a',
              {
                className: 'tiana-account-settings',
                href: settingsUrl,
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              h(Icon, { name: 'settings', size: 13 }),
              h('span', null, t('account.settings')),
            )
          : null,
      );
    }

    function SiteActions({ site, t, onDelete }) {
      return h(
        React.Fragment,
        null,
        site.endpoint
          ? h(
              'a',
              {
                className: 'tiana-icon-btn',
                href: site.endpoint,
                target: '_blank',
                rel: 'noopener noreferrer',
                title: t('sites.open'),
                'aria-label': t('sites.open'),
              },
              h(Icon, { name: 'external', size: 15 }),
            )
          : h(
              'button',
              { type: 'button', className: 'tiana-icon-btn', disabled: true, title: t('sites.open'), 'aria-label': t('sites.open') },
              h(Icon, { name: 'external', size: 15 }),
            ),
        site.consoleUrl
          ? h(
              'a',
              {
                className: 'tiana-icon-btn',
                href: site.consoleUrl,
                target: '_blank',
                rel: 'noopener noreferrer',
                title: t('sites.manage'),
                'aria-label': t('sites.manage'),
              },
              h(Icon, { name: 'settings', size: 15 }),
            )
          : h(
              'button',
              { type: 'button', className: 'tiana-icon-btn', disabled: true, title: t('sites.manage'), 'aria-label': t('sites.manage') },
              h(Icon, { name: 'settings', size: 15 }),
            ),
        h(
          'button',
          {
            type: 'button',
            className: 'tiana-icon-btn is-danger',
            onClick: () => onDelete(site),
            title: t('sites.delete'),
            'aria-label': t('sites.delete'),
          },
          h(Icon, { name: 'x', size: 15 }),
        ),
      );
    }

    function SiteRow({ site, t, onDelete }) {
      const content = h(
        React.Fragment,
        null,
        h(SiteThumb, { site }),
        h(
          'div',
          { className: 'tiana-site-info' },
          h('div', { className: 'tiana-site-title', title: site.title }, site.title),
          h(
            'div',
            { className: 'tiana-site-date' },
            formatDate(site.updatedAt),
            site.enabled === false ? ` · ${t('sites.disabled')}` : null,
            site.owner ? ` · ${site.owner}` : null,
          ),
        ),
      );
      return h(
        'div',
        { className: 'tiana-site-row', role: 'row' },
        h(
          'div',
          { className: 'tiana-site-main', role: 'cell' },
          site.endpoint
            ? h(
                'a',
                {
                  className: 'tiana-site-open',
                  href: site.endpoint,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                },
                content,
              )
            : h('div', { className: 'tiana-site-open' }, content),
        ),
        h(
          'div',
          { className: 'tiana-site-share', role: 'cell' },
          h(Icon, { name: site.source === 'shared' ? 'users' : 'lock', size: 15 }),
          h('span', null, site.source === 'shared' ? t('sites.shared') : t('sites.owned')),
        ),
        h(
          'div',
          { className: 'tiana-site-actions', role: 'cell', 'aria-label': t('sites.actions') },
          h(SiteActions, { site, t, onDelete }),
        ),
      );
    }

    function SiteCard({ site, t, onDelete }) {
      const content = h(
        React.Fragment,
        null,
        h(SiteThumb, { site, large: true }),
        h(
          'div',
          { className: 'tiana-site-card-meta' },
          h(
            'div',
            null,
            h('div', { className: 'tiana-site-card-title', title: site.title }, site.title),
            h(
              'div',
              { className: 'tiana-site-card-date' },
              formatDate(site.updatedAt),
              site.enabled === false ? ` · ${t('sites.disabled')}` : null,
            ),
          ),
          h(
            'div',
            { className: 'tiana-site-card-share' },
            h(Icon, { name: site.source === 'shared' ? 'users' : 'lock', size: 13 }),
            h('span', null, site.source === 'shared' ? t('sites.shared') : t('sites.owned')),
          ),
        ),
      );
      return h(
        'article',
        { className: 'tiana-site-card' },
        site.endpoint
          ? h(
              'a',
              {
                className: 'tiana-site-card-open',
                href: site.endpoint,
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              content,
            )
          : h('div', { className: 'tiana-site-card-open' }, content),
        h(
          'div',
          { className: 'tiana-site-card-actions', 'aria-label': t('sites.actions') },
          h(SiteActions, { site, t, onDelete }),
        ),
      );
    }

    function TemplateCard({ template, t, onPreview, onInstall }) {
      return h(
        'article',
        { className: 'tiana-template-card' },
        h(TemplateCover, { template, t, onOpen: onPreview }),
        h(
          'div',
          { className: 'tiana-template-body' },
          h('h3', { className: 'tiana-template-title', title: template.title }, template.title),
          h('p', { className: 'tiana-template-desc' }, template.description),
          h(TemplateAuthor, { template, t }),
          template.tags.length > 0
            ? h(
                'div',
                { className: 'tiana-template-tags' },
                template.tags.slice(0, 3).map((tag) => h(
                  'span',
                  { key: tag, className: 'tiana-template-tag' },
                  tag,
                )),
              )
            : null,
          h(
            'div',
            { className: 'tiana-template-meta' },
            h(
              'span',
              { className: 'tiana-template-installs' },
              template.installs === null ? null : `${template.installs} ${t('templates.installs')}`,
              template.installs !== null && template.copies !== null ? ' · ' : null,
              template.copies === null ? null : `${template.copies} ${t('templates.copies')}`,
            ),
            h(
              'div',
              { className: 'tiana-template-actions' },
              h(
                'button',
                { type: 'button', className: 'tiana-btn tiana-btn-ghost tiana-btn-small', onClick: onPreview },
                t('templates.preview'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'tiana-btn tiana-btn-primary tiana-btn-small',
                  onClick: onInstall,
                  disabled: !template.enabled,
                },
                t('templates.install'),
              ),
            ),
          ),
        ),
      );
    }

    function TemplateDetailDialog({ t, template, loading, error, onClose, onRetry, onInstall, prompt }) {
      const title = template?.title || t('templates.detail');
      const [copied, setCopied] = React.useState(false);
      const [copyFailed, setCopyFailed] = React.useState(false);
      const copyPrompt = async () => {
        if (!prompt) return;
        try {
          await navigator.clipboard.writeText(prompt);
          setCopied(true);
          setCopyFailed(false);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopyFailed(true);
        }
      };
      const previewParams = new URLSearchParams();
      if (template) {
        previewParams.set('name', template.id);
        if (template.version) previewParams.set('v', template.version);
      }

      return h(
        'div',
        {
          className: 'tiana-dialog-backdrop',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          {
            className: `tiana-dialog${template ? '' : ' tiana-dialog-message'}`,
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': title,
            onMouseDown: (event) => event.stopPropagation(),
          },
          h(
            'button',
            {
              type: 'button',
              className: 'tiana-dialog-close',
              onClick: onClose,
              'aria-label': t('common.close'),
              title: t('common.close'),
            },
            h(Icon, { name: 'x', size: 17 }),
          ),
          template
            ? h(
                React.Fragment,
                null,
                h(
                  'div',
                  { className: 'tiana-dialog-preview' },
                  template.enabled
                    ? h('iframe', {
                        className: 'tiana-preview-frame',
                        src: `/tiana/api/template-preview?${previewParams.toString()}`,
                        title: `${title} ${t('templates.preview')}`,
                        sandbox: 'allow-scripts',
                        referrerPolicy: 'no-referrer',
                      })
                    : h(
                        'div',
                        { className: 'tiana-state' },
                        h('div', { className: 'tiana-empty-icon' }, h(Icon, { name: 'spark', size: 18 })),
                        h('div', { className: 'tiana-state-title' }, t('templates.previewUnavailable')),
                      ),
                ),
                h(
                  'aside',
                  { className: 'tiana-dialog-info' },
                  h('div', { className: 'tiana-dialog-kicker' }, t('templates.detail')),
                  h('h2', { className: 'tiana-dialog-title' }, template.title),
                  h(TemplateAuthor, { template, t }),
                  h('p', { className: 'tiana-dialog-desc' }, template.description),
                  template.tags.length > 0
                    ? h(
                        'div',
                        { className: 'tiana-template-tags' },
                        template.tags.map((tag) => h(
                          'span',
                          { key: tag, className: 'tiana-template-tag' },
                          tag,
                        )),
                      )
                    : null,
                  h(
                    'div',
                    { className: 'tiana-dialog-counts' },
                    template.installs === null ? null : h(
                      'span',
                      null,
                      `${template.installs} ${t('templates.installs')}`,
                    ),
                    template.installs !== null && template.copies !== null ? h('span', null, '·') : null,
                    template.copies === null ? null : h(
                      'span',
                      null,
                      `${template.copies} ${t('templates.copies')}`,
                    ),
                  ),
                  copied || copyFailed
                    ? h(
                        'p',
                        { className: 'tiana-auth-note', role: 'status' },
                        copied ? t('templates.copiedPrompt') : t('templates.promptCopyFailed'),
                      )
                    : null,
                  h(
                    'div',
                    { className: 'tiana-dialog-actions' },
                    prompt
                      ? h(
                          'button',
                          { type: 'button', className: 'tiana-btn tiana-btn-ghost', onClick: copyPrompt },
                          copied ? t('templates.copiedPrompt') : t('templates.copyPrompt'),
                        )
                      : null,
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'tiana-btn tiana-btn-primary',
                        onClick: onInstall,
                        disabled: !template.enabled,
                      },
                      t('templates.install'),
                    ),
                    h(
                      'button',
                      { type: 'button', className: 'tiana-btn tiana-btn-ghost', onClick: onClose },
                      t('common.close'),
                    ),
                  ),
                ),
              )
            : h(
                'div',
                { className: 'tiana-dialog-message-body' },
                loading
                  ? h(
                      React.Fragment,
                      null,
                      h(Spinner, null),
                      h('div', { className: 'tiana-state-title' }, t('templates.loading')),
                    )
                  : h(StateView, {
                      title: t('templates.loadError'),
                      message: error?.message,
                      retryLabel: t('templates.retry'),
                      onRetry,
                    }),
              ),
        ),
      );
    }

    function SandboxToggleSwitch({ t, capability, enabled, onChange, disabled = false }) {
      const supported = capability?.supported === true;
      const checking = capability === null || capability === undefined;
      const checked = supported && enabled;
      const isDisabled = disabled || checking || !supported;
      const reason = !supported && capability?.reason ? ` (${capability.reason})` : '';
      const title = checking
        ? t('local.sandbox.toggleHint')
        : supported
          ? `${t('local.sandbox.toggleHint')}${capability?.enforcement ? ` (${capability.enforcement})` : ''}`
          : `${t('local.sandbox.unsupported')}${reason}`;
      return h(
        'label',
        {
          className: `tiana-sandbox-switch${isDisabled ? ' is-disabled' : ''}`,
          title,
        },
        h('input', {
          type: 'checkbox',
          role: 'switch',
          className: 'tiana-sandbox-switch-input',
          checked,
          disabled: isDisabled,
          'aria-checked': checked,
          onChange: (event) => {
            if (isDisabled) return;
            onChange(event.target.checked);
          },
        }),
        h('span', { className: 'tiana-sandbox-switch-track', 'aria-hidden': true }, h('span', { className: 'tiana-sandbox-switch-thumb' })),
        h('span', { className: 'tiana-sandbox-switch-label' }, t('local.sandbox.toggle')),
        !checking && !supported
          ? h('span', { className: 'tiana-sandbox-switch-note' }, t('local.sandbox.unsupported'))
          : null,
      );
    }

    function InstallChoiceDialog({ t, template, installUrl, onClose, onOpenSession, auth, authControls }) {
      const authenticated = auth.phase === 'authenticated';
      const [directory, setDirectory] = React.useState('');
      const [cloning, setCloning] = React.useState(false);
      const [building, setBuilding] = React.useState(false);
      const [result, setResult] = React.useState(null);
      const [build, setBuild] = React.useState(null);
      const [previewUrl, setPreviewUrl] = React.useState(null);
      const [error, setError] = React.useState(null);
      const [existingLocal, setExistingLocal] = React.useState(null);
      const [sandboxCapability, setSandboxCapability] = React.useState(null);
      const [sandboxEnabled, setSandboxEnabled] = React.useState(() => readSandboxPreference());
      const [duplicateMode, setDuplicateMode] = React.useState('idle');
      const [folderName, setFolderName] = React.useState('');
      const [duplicateError, setDuplicateError] = React.useState(null);
      const pollRef = React.useRef(null);
      const aliveRef = React.useRef(true);
      const attemptsRef = React.useRef(0);
      const locked = cloning || building;
      const phaseLabels = {
        installing: 'templates.phaseInstalling',
        building: 'templates.phaseBuilding',
        database: 'templates.phaseDatabase',
        starting: 'templates.phaseStarting',
        ready: 'templates.phaseReady',
        failed: 'templates.phaseFailed',
        stopped: 'templates.phaseStopped',
      };
      const phaseLabel = build && phaseLabels[build.phase] ? t(phaseLabels[build.phase]) : null;
      const dsh = build?.dshWorkspace ?? result?.workspace?.dshWorkspace ?? result?.dshWorkspace;
      const session = build?.dshSession ?? result?.workspace?.dshSession ?? result?.dshSession;
      const copyFolderBase = String(template.title || template.id)
        .replace(/[\\/:*?"<>|]/g, '-')
        .trim() || template.id;

      React.useEffect(() => () => {
        aliveRef.current = false;
        if (pollRef.current !== null) clearTimeout(pollRef.current);
      }, []);

      React.useEffect(() => {
        let cancelled = false;
        setExistingLocal(null);
        setDuplicateMode('idle');
        setDuplicateError(null);
        void tianaFetch('/tiana/api/workspaces')
          .then((payload) => {
            if (cancelled) return;
            setSandboxCapability(payload.sandbox ?? { supported: false, enforcement: null, reason: null });
            const matches = Array.isArray(payload.items)
              ? payload.items.filter((item) => item.template === template.id)
              : [];
            setExistingLocal(matches);
            if (matches.length > 0) {
              const used = new Set(matches.map((item) => String(item.directory).split(/[\\/]/).pop()));
              let candidate = copyFolderBase;
              let index = 2;
              while (used.has(candidate)) {
                candidate = `${copyFolderBase}-${index}`;
                index += 1;
              }
              setFolderName(candidate);
            }
          })
          .catch(() => {
            if (!cancelled) setExistingLocal([]);
          });
        return () => {
          cancelled = true;
        };
      }, [copyFolderBase, template.id]);

      const openExisting = async (item) => {
        setDuplicateError(null);
        try {
          const payload = await tianaFetch(`/tiana/api/workspaces/session?id=${encodeURIComponent(item.id)}`, { method: 'POST' });
          if (payload.error || !payload.session?.ready || typeof onOpenSession !== 'function' || !onOpenSession(payload.session.sessionId)) {
            throw new Error(payload.error?.message || t('templates.duplicateOpenFailed'));
          }
          onClose?.();
        } catch (cause) {
          setDuplicateError(cause instanceof Error ? cause.message : String(cause));
        }
      };

      const poll = async (id) => {
        if (!aliveRef.current) return;
        try {
          const payload = await tianaFetch(
            `/tiana/api/workspaces/status?id=${encodeURIComponent(id)}`,
          );
          if (!aliveRef.current) return;
          if (payload.error || !payload.workspace) {
            throw new Error(payload.error?.message || 'Local workspace status is unavailable.');
          }
          const workspace = payload.workspace;
          setBuild(workspace);
          if (workspace.status === 'ready') {
            setBuilding(false);
            setPreviewUrl(workspace.previewUrl ?? null);
            if (workspace.previewUrl === null) {
              setError(t('templates.previewStopped'));
            }
            return;
          }
          if (workspace.status === 'failed') {
            setBuilding(false);
            setError(workspace.error || t('templates.cloneFailed'));
            return;
          }
          if (workspace.status === 'stopped') {
            setBuilding(false);
            setError(t('templates.previewStopped'));
            return;
          }
          attemptsRef.current += 1;
          if (attemptsRef.current > 900) {
            setBuilding(false);
            setError(t('templates.cloneFailed'));
            return;
          }
          pollRef.current = setTimeout(() => void poll(id), 1000);
        } catch (cause) {
          if (!aliveRef.current) return;
          setBuilding(false);
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      };

      const beginPolling = (id) => {
        attemptsRef.current = 0;
        void poll(id);
      };

      const clone = async () => {
        if (!authenticated || locked) return;
        if (existingLocal === null) return;
        if (existingLocal.length > 0 && duplicateMode !== 'new') {
          setDuplicateError(t('templates.localDuplicateBody'));
          return;
        }
        let customDirectory = directory.trim();
        let allowDuplicate = false;
        if (duplicateMode === 'new') {
          const name = folderName.trim();
          if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
            setDuplicateError(t('templates.newFolderInvalid'));
            return;
          }
          customDirectory = `~/TianaTemplates/${name}`;
          allowDuplicate = true;
        }
        setCloning(true);
        setResult(null);
        setBuild(null);
        setPreviewUrl(null);
        setError(null);
        setDuplicateError(null);
        try {
          const params = new URLSearchParams({ name: template.id });
          if (allowDuplicate) params.set('allow', '1');
          if (customDirectory !== '') params.set('dir', customDirectory);
          if (sandboxCapability?.supported !== true || !sandboxEnabled) params.set('sandbox', 'off');
          const payload = await tianaFetch(
            `/tiana/api/templates/clone?${params.toString()}`,
            { method: 'POST' },
          );
          if (payload.duplicate === true && Array.isArray(payload.existing)) {
            setExistingLocal(payload.existing);
            setDuplicateMode('idle');
            setCloning(false);
            return;
          }
          if (payload.ok !== true || payload.error) {
            throw new Error(payload.error?.message || 'Template clone did not succeed.');
          }
          if (!payload.workspace?.id) {
            throw new Error('The clone did not return a local workspace.');
          }
          rememberInstallNotice(payload.workspace);
          const guided = payload.workspace?.dshSession;
          if (guided?.ok && guided.ready === true && typeof onOpenSession === 'function' && onOpenSession(guided.sessionId)) {
            setCloning(false);
            if (typeof onClose === 'function') onClose();
            return;
          }
          setResult(payload);
          setBuild(payload.workspace);
          setCloning(false);
          setBuilding(true);
          beginPolling(payload.workspace.id);
        } catch (cause) {
          setCloning(false);
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      };

      const retry = async () => {
        if (locked || !result?.workspace?.id) return;
        setBuilding(true);
        setError(null);
        setPreviewUrl(null);
        try {
          const retryParams = new URLSearchParams({ id: result.workspace.id });
          if (sandboxCapability?.supported !== true || !sandboxEnabled) retryParams.set('sandbox', 'off');
          const payload = await tianaFetch(
            `/tiana/api/workspaces/prepare?${retryParams.toString()}`,
            { method: 'POST' },
          );
          if (payload.ok !== true || payload.error || !payload.workspace) {
            throw new Error(payload.error?.message || 'Local preview rebuild did not start.');
          }
          setBuild(payload.workspace);
          beginPolling(result.workspace.id);
        } catch (cause) {
          setBuilding(false);
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      };

      const localAction = build?.status === 'failed' || build?.status === 'stopped'
        ? h(
            'button',
            {
              type: 'button',
              className: 'tiana-btn tiana-btn-primary',
              onClick: retry,
              disabled: locked,
            },
            t('templates.retryBuild'),
          )
        : build?.status === 'ready'
          ? h(
              'button',
              { type: 'button', className: 'tiana-btn tiana-btn-primary', disabled: true },
              t('templates.phaseReady'),
            )
          : h(
              'button',
              {
                type: 'button',
                className: 'tiana-btn tiana-btn-primary',
                onClick: clone,
                disabled: locked,
              },
              cloning ? t('templates.cloning') : building ? (phaseLabel ?? t('templates.cloning')) : t('templates.cloneAction'),
            );

      const duplicateFound = existingLocal !== null && existingLocal.length > 0;
      const duplicateNew = duplicateFound && duplicateMode === 'new';
      const showCloneForm = existingLocal !== null && (!duplicateFound || duplicateNew);

      return h(
        'div',
        {
          className: 'tiana-dialog-backdrop',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && !locked) onClose();
          },
        },
        h(
          'div',
          {
            className: 'tiana-dialog tiana-fork-dialog',
            style: authenticated ? undefined : { maxWidth: 420 },
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('templates.chooseInstall'),
            onMouseDown: (event) => event.stopPropagation(),
          },
          h(
            'button',
            {
              type: 'button',
              className: 'tiana-dialog-close',
              onClick: onClose,
              disabled: locked,
              'aria-label': t('common.close'),
              title: t('common.close'),
            },
            h(Icon, { name: 'x', size: 17 }),
          ),
          h(
            'div',
            { className: 'tiana-fork-body' },
            h('div', { className: 'tiana-dialog-kicker' }, t('templates.chooseInstall')),
            h('h2', { className: 'tiana-dialog-title' }, template.title),
            h(TemplateAuthor, { template, t }),
            authenticated ? h('p', { className: 'tiana-dialog-desc' }, t('templates.forkHint')) : null,
            authenticated ? null : h(AuthGate, { t, auth, ...authControls, reason: t('templates.installLogin') }),
            authenticated ? h('div', { className: 'tiana-install-options' },
            h(
              'section',
              { className: 'tiana-install-option' },
              h(
                'div',
                { className: 'tiana-install-option-head' },
                h('div', { className: 'tiana-auth-icon' }, h(Icon, { name: 'download', size: 20 })),
                h(
                  'div',
                  null,
                  h('h3', null, t('templates.cloneTitle')),
                  h('p', { className: 'tiana-auth-body' }, t('templates.cloneBody')),
                ),
              ),
              !authenticated ? null : existingLocal === null
                ? h('p', { className: 'tiana-auth-note' }, t('templates.checkingLocal'))
                : duplicateFound && !duplicateNew
                  ? h(
                      React.Fragment,
                      null,
                      h(
                        'div',
                        { className: 'tiana-duplicate' },
                        h('div', { className: 'tiana-duplicate-title' }, t('templates.localDuplicateTitle')),
                        h('p', { className: 'tiana-duplicate-body' }, t('templates.localDuplicateBody')),
                        existingLocal.map((item) => h(
                          'div',
                          { key: item.id, className: 'tiana-duplicate-row' },
                          h(
                            'div',
                            { className: 'tiana-duplicate-info' },
                            h('div', { className: 'tiana-duplicate-name', title: item.title }, item.title),
                            h('code', { title: item.directory }, item.directory),
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'tiana-btn tiana-btn-ghost tiana-btn-small',
                              onClick: () => openExisting(item),
                            },
                            t('templates.openExisting'),
                          ),
                        )),
                        duplicateError === null
                          ? null
                          : h('p', { className: 'tiana-auth-warn' }, duplicateError),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'tiana-btn tiana-btn-primary',
                          onClick: () => {
                            const used = new Set(existingLocal.map((item) => String(item.directory).split(/[\\/]/).pop()));
                            let candidate = copyFolderBase;
                            let index = 2;
                            while (used.has(candidate)) {
                              candidate = `${copyFolderBase}-${index}`;
                              index += 1;
                            }
                            setFolderName(candidate);
                            setDuplicateMode('new');
                            setDuplicateError(null);
                          },
                        },
                        t('templates.cloneAnother'),
                      ),
                  )
                  : showCloneForm
                    ? h(
                        React.Fragment,
                        null,
                        duplicateNew
                          ? h(
                              'label',
                              { className: 'tiana-install-field' },
                              h('span', null, t('templates.newFolderName')),
                              h('input', {
                                type: 'text',
                                value: folderName,
                                placeholder: `${copyFolderBase}-2`,
                                disabled: locked,
                                onChange: (event) => {
                                  setFolderName(event.target.value);
                                  setDuplicateError(null);
                                },
                              }),
                              h(
                                'small',
                                { className: 'tiana-field-hint' },
                                `${t('templates.newFolderHint')}${folderName.trim() || template.id}`,
                              ),
                            )
                          : h(
                              'label',
                              { className: 'tiana-install-field' },
                              h('span', null, t('templates.cloneDir')),
                              h('input', {
                                type: 'text',
                                value: directory,
                                placeholder: `~/TianaTemplates/${copyFolderBase}`,
                                autoCorrect: 'off',
                                autoCapitalize: 'none',
                                spellCheck: false,
                                disabled: locked,
                                onChange: (event) => setDirectory(event.target.value),
                              }),
                            ),
                        h(SandboxToggleSwitch, {
                          t,
                          capability: sandboxCapability,
                          enabled: sandboxEnabled,
                          disabled: locked,
                          onChange: (next) => {
                            setSandboxEnabled(next);
                            writeSandboxPreference(next);
                          },
                        }),
                        duplicateError === null
                          ? null
                          : h('p', { className: 'tiana-auth-warn' }, duplicateError),
                        h(
                          'div',
                          { className: 'tiana-install-option-actions' },
                          duplicateNew
                            ? h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'tiana-btn tiana-btn-ghost',
                                  onClick: () => {
                                    setDuplicateMode('idle');
                                    setDuplicateError(null);
                                  },
                                  disabled: locked,
                                },
                                t('templates.backToExisting'),
                              )
                            : null,
                          localAction,
                          previewUrl
                            ? h(
                                'a',
                                {
                                  className: 'tiana-btn tiana-btn-ghost',
                                  href: previewUrl,
                                  target: '_blank',
                                  rel: 'noopener noreferrer',
                                },
                                t('templates.previewOpen'),
                              )
                            : null,
                          previewUrl
                            ? h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'tiana-btn tiana-btn-ghost',
                                  onClick: retry,
                                  disabled: locked,
                                },
                                t('templates.retryBuild'),
                              )
                            : null,
                        ),
                      )
                    : null,
              result === null
                ? null
                : h(
                    'div',
                    { className: 'tiana-install-result', role: 'status' },
                    h('div', { className: 'tiana-state-title' }, dsh?.ok ? t('templates.workspaceCreated') : t('templates.sourceCloned')),
                    h('code', null, `${t('templates.clonePath')}: ${result.directory}`),
                    dsh?.ok
                      ? h(
                          'p',
                          { className: 'tiana-auth-note' },
                          `${t('templates.dshWorkspace')}: ${dsh.title} · ${t('templates.workspaceSwitch')}`,
                        )
                      : h(
                          'p',
                          { className: 'tiana-auth-warn' },
                          dsh?.error?.message ?? t('templates.workspaceFailed'),
                        ),
                    session?.ok
                      ? h(
                          'p',
                          { className: session.renamed === false ? 'tiana-auth-warn' : 'tiana-auth-note' },
                          `${t('templates.guidedSession')}: ${session.title} · ${t('templates.sessionRefresh')}`,
                        )
                      : h(
                          'p',
                          { className: 'tiana-auth-warn' },
                          session?.error?.message ?? t('templates.sessionFailed'),
                        ),
                    session?.ok && session.renamed === false
                      ? h('p', { className: 'tiana-auth-warn' }, t('templates.sessionRenameFailed'))
                      : null,
                    session?.ok && session.ready === false
                      ? h('p', { className: 'tiana-auth-warn' }, session.readyError?.message ?? t('templates.sessionReadyFailed'))
                      : null,
                    phaseLabel
                      ? h('p', { className: 'tiana-auth-note' }, phaseLabel)
                      : null,
                    build?.warning
                      ? h('p', { className: 'tiana-auth-warn' }, build.warning)
                      : null,
                    h('p', { className: 'tiana-auth-note' }, t('templates.localMockNote')),
                  ),
              error === null ? null : h('div', { className: 'tiana-auth-error' }, error),
            ),
            h(
              'section',
              { className: 'tiana-install-option' },
              h(
                'div',
                { className: 'tiana-install-option-head' },
                h('div', { className: 'tiana-auth-icon' }, h(Icon, { name: 'globe', size: 20 })),
                h(
                  'div',
                  null,
                  h('h3', null, t('templates.installTianaTitle')),
                  h('p', { className: 'tiana-auth-body' }, t('templates.installTianaBody')),
                ),
              ),
              !authenticated ? null : installUrl && !locked
                ? h(
                    'a',
                    {
                      className: 'tiana-btn tiana-btn-primary',
                      href: installUrl,
                      target: '_blank',
                      rel: 'noopener noreferrer',
                      onClick: onClose,
                    },
                    t('templates.installTianaAction'),
                  )
                : h(
                    'button',
                    { type: 'button', className: 'tiana-btn tiana-btn-primary', disabled: true },
                    t('templates.installTianaAction'),
                  ),
            ),
            ) : null,
          ),
        ),
      );
    }

    function SiteDeleteDialog({ t, site, busy, error, onCancel, onConfirm }) {
      return h(
        'div',
        {
          className: 'tiana-dialog-backdrop',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && !busy) onCancel();
          },
        },
        h(
          'div',
          {
            className: 'tiana-dialog tiana-dialog-message',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('sites.deleteTitle'),
            onMouseDown: (event) => event.stopPropagation(),
          },
          h(
            'button',
            {
              type: 'button',
              className: 'tiana-dialog-close',
              onClick: onCancel,
              disabled: busy,
              'aria-label': t('common.close'),
              title: t('common.close'),
            },
            h(Icon, { name: 'x', size: 17 }),
          ),
          h(
            'div',
            { className: 'tiana-dialog-message-body' },
            h('h2', { className: 'tiana-dialog-title' }, t('sites.deleteTitle')),
            h('p', { className: 'tiana-dialog-desc' }, t('sites.deleteBody')),
            h('p', { className: 'tiana-dialog-counts' }, site.title),
            h('p', { className: 'tiana-auth-note' }, t('sites.deleteHint')),
            error === null ? null : h('div', { className: 'tiana-auth-error' }, error),
            h(
              'div',
              { className: 'tiana-dialog-actions' },
              h(
                'button',
                { type: 'button', className: 'tiana-btn tiana-btn-ghost', onClick: onCancel, disabled: busy },
                t('common.cancel'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'tiana-btn tiana-btn-primary',
                  onClick: onConfirm,
                  disabled: busy,
                },
                busy ? t('sites.deleting') : t('sites.delete'),
              ),
            ),
          ),
        ),
      );
    }

    function Pagination({ t, page, totalPages, busy, hasNext, onPrevious, onNext }) {
      return h('nav', { className: 'tiana-pagination', 'aria-label': t('pagination.label') },
        h('button', { type: 'button', className: 'tiana-btn tiana-btn-ghost tiana-btn-small',
          disabled: busy || page <= 1, onClick: onPrevious }, t('pagination.previous')),
        h('span', { role: 'status' }, `${t('pagination.page')} ${page}${totalPages ? ` / ${totalPages}` : ''}`),
        h('button', { type: 'button', className: 'tiana-btn tiana-btn-ghost tiana-btn-small',
          disabled: busy || !hasNext, onClick: onNext }, t('pagination.next')),
      );
    }

    function SitesView({
      t, sites, tab, setTab, query, setQuery,
      onNotice, notice, onCloseNotice,
      auth, login, onStartLogin, onOpenLogin, onCopyLogin, onCancelLogin, onRetryStatus,
      sitesLoading, sitesError, onRetrySites, sharedUnavailable,
      onDeleteSite, onRefreshSites, page, total, totalPages, onPrevious, onNext,
    }) {
      const authenticated = auth.phase === 'authenticated';
      const sharedEmpty = tab === 'shared' && sharedUnavailable;
      const emptyTitle = sharedEmpty ? t('sites.sharedUnavailable') : t('sites.empty');
      const emptyHint = sharedEmpty ? t('sites.sharedUnavailableHint') : t('sites.emptyHint');
      const [siteToDelete, setSiteToDelete] = React.useState(null);
      const [deleteBusy, setDeleteBusy] = React.useState(false);
      const [deleteError, setDeleteError] = React.useState(null);

      const requestDelete = (site) => {
        setDeleteError(null);
        setSiteToDelete(site);
      };
      const confirmDelete = async () => {
        if (siteToDelete === null) return;
        setDeleteBusy(true);
        setDeleteError(null);
        try {
          await onDeleteSite(siteToDelete);
          setSiteToDelete(null);
        } catch (error) {
          setDeleteError(error instanceof Error ? error.message : String(error));
        } finally {
          setDeleteBusy(false);
        }
      };

      return h(
        React.Fragment,
        null,
        h(
          'header',
          { className: 'tiana-page-head' },
          h(
            'div',
            { className: 'tiana-heading' },
            h('h1', null, t('sites.title')),
            h('p', { className: 'tiana-subtitle' }, t('sites.subtitle')),
          ),
          h(
            'div',
            { className: 'tiana-head-actions' },
            h(SearchBox, {
              value: query,
              onChange: setQuery,
              placeholder: t('sites.search'),
              disabled: !authenticated,
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'tiana-icon-btn',
                onClick: onRefreshSites,
                disabled: !authenticated || sitesLoading,
                title: t('sites.refresh'),
                'aria-label': t('sites.refresh'),
              },
              h(Icon, { name: 'refresh', size: 16 }),
            ),
          ),
        ),
        notice === null ? null : h(Notice, { text: t(notice), onClose: onCloseNotice, t }),
        authenticated
          ? sitesLoading && sites.length === 0
            ? h(
                'div',
                { className: 'tiana-state' },
                h(Spinner, null),
                h('div', { className: 'tiana-state-title' }, t('sites.loading')),
              )
            : sitesError !== null && sites.length === 0
              ? h(StateView, {
                  title: t('sites.loadError'),
                  message: sitesError.message,
                  retryLabel: t('sites.retry'),
                  onRetry: onRetrySites,
                })
              : h(
                  React.Fragment,
                  null,
                  h(
                    'div',
                    { className: 'tiana-tab-row' },
                    h(
                      'div',
                      { className: 'tiana-tabs' },
                      SITE_TABS.map((item) =>
                        h(TabButton, {
                          key: item.id,
                          active: tab === item.id,
                          label: t(item.key),
                          onClick: () => setTab(item.id),
                        }),
                      ),
                    ),
                  ),
                  sitesError === null ? null : h('p', { className: 'tiana-load-more-error', role: 'alert' }, sitesError.message),
                  sites.length === 0
                    ? h(EmptyState, { title: emptyTitle, hint: emptyHint })
                    : h(
                        'div',
                        { className: 'tiana-table', role: 'table', 'aria-label': t('sites.title') },
                        h(
                          'div',
                          { className: 'tiana-table-head', role: 'row' },
                          h('span', { role: 'columnheader' }, t('sites.column.site')),
                          h('span', { role: 'columnheader' }, t('sites.column.share')),
                          h('span', { role: 'columnheader' }, t('sites.actions')),
                        ),
                        sites.map((site) => h(SiteRow, { key: site.id, site, t, onDelete: requestDelete })),
                      ),
                  h(
                    'p',
                    { className: 'tiana-list-footer' },
                    `${sites.length} / ${sharedEmpty ? 0 : total} ${t('sites.count')}`,
                  ),
                  sharedEmpty ? null : h(Pagination, { t, page, totalPages, busy: sitesLoading, hasNext: page < totalPages, onPrevious, onNext }),
                )
          : h(AuthGate, {
              t,
              auth,
              login,
              onStartLogin,
              onOpenLogin,
              onCopyLogin,
              onCancelLogin,
              onRetryStatus,
            }),
        siteToDelete === null
          ? null
          : h(SiteDeleteDialog, {
              t,
              site: siteToDelete,
              busy: deleteBusy,
              error: deleteError,
              onCancel: () => {
                if (!deleteBusy) {
                  setSiteToDelete(null);
                  setDeleteError(null);
                }
              },
              onConfirm: confirmDelete,
            }),
      );
    }

    function TemplatesView({
      t, templates, categories, query, setQuery, category, setCategory,
      onNotice, notice, onCloseNotice, auth, authControls,
      templatesLoading, templatesLoadingMore, templatesError, templatesMoreError,
      onRetryTemplates, onLoadMore, onRetryMore, hasMore, page, onPrevious,
      installOrigin, onOpenSession,
    }) {
      const sentinelRef = React.useRef(null);
      React.useEffect(() => {
        if (!hasMore || templatesLoading || templatesLoadingMore || templatesMoreError || !sentinelRef.current) return undefined;
        const observer = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) onLoadMore();
        }, { root: sentinelRef.current.closest('.tiana-content-scroll'), rootMargin: '240px' });
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
      }, [hasMore, templatesLoading, templatesLoadingMore, templatesMoreError, onLoadMore]);
      const authenticated = auth.phase === 'authenticated';
      const [selectedName, setSelectedName] = React.useState(null);
      const [installTarget, setInstallTarget] = React.useState(null);
      const [detail, setDetail] = React.useState({ loading: false, item: null, error: null });
      const [detailAttempt, setDetailAttempt] = React.useState(0);
      const categoryOptions = [
        { id: 'all', label: t('templates.category.all') },
        ...(categories ?? []).map((item) => ({ id: String(item.id), label: item.name })),
      ];
      const categoryNames = new Map((categories ?? []).map((item) => [String(item.id), item.name]));
      const installUrlFor = (name) => {
        if (typeof installOrigin !== 'string' || installOrigin.length === 0) return null;
        const params = new URLSearchParams({ template_id: name, install: '1', _from: ACQUISITION_SOURCE });
        return `${installOrigin}/marketplace?${params.toString()}`;
      };
      const detailTemplate = detail.item ? mapTemplate(detail.item, 0, categoryNames) : null;

      React.useEffect(() => {
        if (selectedName === null) {
          setDetail({ loading: false, item: null, error: null });
          return undefined;
        }
        const controller = new AbortController();
        setDetail({ loading: true, item: null, error: null });
        void tianaFetch(
          `/tiana/api/template-detail?name=${encodeURIComponent(selectedName)}`,
          { signal: controller.signal },
        ).then((payload) => {
          if (controller.signal.aborted) return;
          if (payload.error) {
            setDetail({ loading: false, item: null, error: payload.error });
            return;
          }
          setDetail({ loading: false, item: payload.item, error: null });
        }).catch((error) => {
          if (!controller.signal.aborted) {
            setDetail({
              loading: false,
              item: null,
              error: { code: 'DETAIL_FAILED', message: error.message },
            });
          }
        });
        return () => controller.abort();
      }, [selectedName, detailAttempt]);

      React.useEffect(() => {
        if (selectedName === null) return undefined;
        const onKey = (event) => {
          if (event.key === 'Escape') {
            setSelectedName(null);
            setDetail({ loading: false, item: null, error: null });
          }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [selectedName]);

      const openDetail = (name) => {
        setDetail({ loading: true, item: null, error: null });
        setSelectedName(name);
      };
      const closeDetail = () => {
        setSelectedName(null);
        setDetail({ loading: false, item: null, error: null });
      };
      const openInstall = (template) => {
        closeDetail();
        setInstallTarget(template);
      };
      const retryDetail = () => {
        setDetail({ loading: true, item: null, error: null });
        setDetailAttempt((value) => value + 1);
      };
      return h(
        React.Fragment,
        null,
        h(
          'header',
          { className: 'tiana-page-head' },
          h(
            'div',
            { className: 'tiana-heading' },
            h('h1', null, t('templates.title')),
            h('p', { className: 'tiana-subtitle' }, t('templates.subtitle')),
          ),
          h(
            'div',
            { className: 'tiana-head-actions' },
            h(SearchBox, {
              value: query,
              onChange: setQuery,
              placeholder: t('templates.search'),
            }),
            h('button', { type: 'button', className: 'tiana-icon-btn', onClick: onRetryTemplates,
              disabled: templatesLoading || templatesLoadingMore, title: t('templates.refresh'),
              'aria-label': t('templates.refresh') }, h(Icon, { name: 'refresh', size: 16 })),
          ),
        ),
        notice === null ? null : h(Notice, { text: t(notice), onClose: onCloseNotice, t }),
        h(
          'div',
          { className: 'tiana-chips', role: 'group', 'aria-label': t('templates.title') },
          categoryOptions.map((item) =>
            h(
              'button',
              {
                key: item.id,
                type: 'button',
                className: `tiana-chip${category === item.id ? ' is-active' : ''}`,
                onClick: () => setCategory(item.id),
                'aria-pressed': category === item.id,
              },
              item.label,
            ),
          ),
        ),
        templatesLoading && templates.length === 0
          ? h(
              'div',
              { className: 'tiana-state' },
              h(Spinner, null),
              h('div', { className: 'tiana-state-title' }, t('templates.loading')),
            )
          : templatesError !== null && templates.length === 0
            ? h(StateView, {
                title: t('templates.loadError'),
                message: templatesError.message,
                retryLabel: t('templates.retry'),
                onRetry: onRetryTemplates,
              })
            : templates.length === 0
              ? h(EmptyState, { title: t('templates.empty'), hint: t('templates.emptyHint') })
              : h(
                  React.Fragment,
                  null,
                  h(
                    'div',
                    { className: 'tiana-template-grid' },
                    templates.map((template) =>
                      h(TemplateCard, {
                        key: template.id,
                        template,
                        t,
                        onPreview: () => openDetail(template.id),
                        onInstall: () => openInstall(template),
                      }),
                    ),
                  ),
                  h('div', { ref: sentinelRef, className: 'tiana-template-sentinel', style: { height: 1 }, 'aria-hidden': true }),
                  templatesLoadingMore
                    ? h(
                        'div',
                        { className: 'tiana-load-more' },
                        h(Spinner, null),
                        h('span', null, t('templates.loadingMore')),
                      )
                    : null,
                  templatesMoreError !== null
                    ? h(
                        'div',
                        { className: 'tiana-load-more-error' },
                        h('span', null, t('templates.loadMoreError')),
                        h(
                          'button',
                          { type: 'button', className: 'tiana-btn tiana-btn-ghost tiana-btn-small', onClick: onRetryMore },
                          t('templates.retryMore'),
                        ),
                      )
                    : null,
                  !templatesLoading && !hasMore && templatesMoreError === null
                    ? h('p', { className: 'tiana-list-end' }, t('templates.allLoaded'))
                    : null,
                  h(
                    'p',
                    { className: 'tiana-list-footer' },
                    `${templates.length} ${t('templates.count')}`,
                    h('span', { className: 'tiana-footnote' }, ` · ${t('templates.footer')}`),
                  ),
                ),
        selectedName === null
          ? null
          : h(TemplateDetailDialog, {
              t,
              template: detailTemplate,
              loading: detail.loading,
              error: detail.error,
              onClose: closeDetail,
              onRetry: retryDetail,
              onInstall: () => {
                if (detailTemplate) openInstall(detailTemplate);
              },
              prompt: detail.item?.prompt ?? '',
            }),
        installTarget === null
          ? null
          : h(InstallChoiceDialog, {
              t,
              auth,
              authControls,
              template: installTarget,
              installUrl: installUrlFor(installTarget.id),
              onClose: () => setInstallTarget(null),
              onOpenSession,
            }),
      );
    }

    function TianaConversationPreview({ t, sessionId }) {
      const [workspace, setWorkspace] = React.useState(null);
      const [loading, setLoading] = React.useState(true);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      const aliveRef = React.useRef(true);
      const shouldOpenRef = React.useRef(false);
      const sessionKey = typeof sessionId === 'string' ? sessionId : '';
      const requestWorkspace = React.useCallback(async () => {
        if (sessionKey === '') return null;
        const payload = await tianaFetch(
          `/tiana/api/workspaces/for-session?id=${encodeURIComponent(sessionKey)}`,
        );
        if (payload.error) throw new Error(payload.error.message);
        return payload.workspace ?? null;
      }, [sessionKey]);

      React.useEffect(() => {
        aliveRef.current = true;
        setWorkspace(null);
        setLoading(true);
        setBusy(false);
        setError(null);
        shouldOpenRef.current = false;
        if (sessionKey === '') {
          setLoading(false);
          return () => {};
        }
        void requestWorkspace()
          .then((next) => {
            if (aliveRef.current) setWorkspace(next);
          })
          .catch((cause) => {
            if (aliveRef.current) setError(cause instanceof Error ? cause.message : String(cause));
          })
          .finally(() => {
            if (aliveRef.current) setLoading(false);
          });
        return () => {
          aliveRef.current = false;
          shouldOpenRef.current = false;
        };
      }, [requestWorkspace, sessionKey]);

      React.useEffect(() => {
        if (workspace?.status !== 'preparing') return undefined;
        const timer = setTimeout(async () => {
          try {
            const next = await requestWorkspace();
            if (aliveRef.current) setWorkspace(next);
          } catch (cause) {
            if (aliveRef.current) {
              setError(cause instanceof Error ? cause.message : String(cause));
              setBusy(false);
            }
          }
        }, 1000);
        return () => clearTimeout(timer);
      }, [workspace, requestWorkspace]);

      React.useEffect(() => {
        if (workspace?.status === 'ready') {
          setBusy(false);
          if (shouldOpenRef.current && workspace.previewUrl) {
            shouldOpenRef.current = false;
            if (!openPreviewWindow(workspace.previewUrl)) setError(t('local.popupBlocked'));
          }
          if (!workspace.previewUrl) setError(t('preview.failed'));
          return;
        }
        if (workspace?.status === 'failed') {
          setBusy(false);
          setError(workspace.error || t('preview.failed'));
          shouldOpenRef.current = false;
        }
      }, [workspace, t]);

      const startPreview = async () => {
        if (busy || workspace === null || workspace.status === 'preparing') return;
        setBusy(true);
        setError(null);
        shouldOpenRef.current = true;
        try {
          const prepParams = new URLSearchParams({ id: workspace.id });
          if (!readSandboxPreference()) prepParams.set('sandbox', 'off');
          const payload = await tianaFetch(
            `/tiana/api/workspaces/prepare?${prepParams.toString()}`,
            { method: 'POST' },
          );
          if (payload.error) throw new Error(payload.error.message);
          if (payload.workspace) setWorkspace(payload.workspace);
        } catch (cause) {
          shouldOpenRef.current = false;
          setError(cause instanceof Error ? cause.message : String(cause));
          setBusy(false);
        }
      };

      if (loading || workspace === null) return null;
      const baseStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: '26px',
        padding: '0 8px',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '7px',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        font: 'inherit',
        fontSize: '12px',
        lineHeight: 1,
        cursor: 'pointer',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      };
      if (workspace.status === 'ready' && workspace.previewUrl) {
        return h(
          'a',
          {
            href: workspace.previewUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
            title: error ?? t('preview.title'),
            style: baseStyle,
          },
          h(Icon, { name: 'globe', size: 13 }),
          t('preview.button'),
        );
      }
      if (workspace.status === 'preparing') {
        return h(
          'button',
          {
            type: 'button',
            disabled: true,
            title: t('preview.title'),
            style: { ...baseStyle, opacity: 0.6, cursor: 'default' },
          },
          h(Icon, { name: 'globe', size: 13 }),
          t('preview.building'),
        );
      }
      return h(
        'button',
        {
          type: 'button',
          onClick: startPreview,
          disabled: busy,
          title: error ?? t('preview.title'),
          style: busy ? { ...baseStyle, opacity: 0.6, cursor: 'default' } : baseStyle,
        },
        h(Icon, { name: 'globe', size: 13 }),
        busy
          ? t('preview.building')
          : workspace.status === 'failed'
            ? t('preview.retry')
            : t('preview.start'),
      );
    }

    function LocalProjectsView({ t, items, sandboxCapability, sandboxEnabled, onToggleSandbox, loading, error, onRefresh, onPrepare, onStop, onOpenSession }) {
      const [busyId, setBusyId] = React.useState(null);
      const [actionError, setActionError] = React.useState(null);
      const useSandbox = sandboxCapability?.supported === true && sandboxEnabled;
      const pendingPreview = React.useRef(null);
      React.useEffect(() => {
        const pending = pendingPreview.current;
        if (!pending) return;
        const workspace = items.find(item => item.id === pending.id);
        if (workspace?.status === 'ready' && workspace.previewUrl && workspace.readyAt !== pending.readyAt) {
          if (!openPreviewWindow(workspace.previewUrl)) setActionError(t('local.popupBlocked'));
          pendingPreview.current = null;
        } else if (workspace?.status === 'failed') {
          pendingPreview.current = null;
        }
      }, [items, t]);
      React.useEffect(() => () => {
        pendingPreview.current = null;
      }, []);

      const startPreview = async (workspace) => {
        if (busyId !== null) return;
        setBusyId(workspace.id);
        setActionError(null);
        pendingPreview.current = { id: workspace.id, readyAt: workspace.readyAt };
        try {
          await onPrepare(workspace.id, !useSandbox);
        } catch (cause) {
          pendingPreview.current = null;
          setActionError(cause instanceof Error ? cause.message : String(cause));
        } finally {
          setBusyId(null);
        }
      };

      const openSession = async (workspace) => {
        if (busyId !== null) return;
        setBusyId(workspace.id);
        setActionError(null);
        try {
          const payload = await tianaFetch(`/tiana/api/workspaces/session?id=${encodeURIComponent(workspace.id)}`, { method: 'POST' });
          if (payload.error || !payload.session?.ready) throw new Error(payload.error?.message || t('templates.sessionFailed'));
          if (typeof onOpenSession !== 'function' || !onOpenSession(payload.session.sessionId)) throw new Error(t('templates.sessionFailed'));
        } catch (cause) {
          setActionError(cause instanceof Error ? cause.message : String(cause));
        } finally { setBusyId(null); }
      };
      const stopPreview = async (workspace) => {
        setBusyId(workspace.id);
        setActionError(null);
        try { await onStop(workspace.id); }
        catch (cause) { setActionError(cause instanceof Error ? cause.message : String(cause)); }
        finally { setBusyId(null); }
      };

      return h(
        React.Fragment,
        null,
        h(
          'header',
          { className: 'tiana-page-head' },
          h(
            'div',
            { className: 'tiana-heading' },
            h('h1', null, t('local.title')),
            h('p', { className: 'tiana-subtitle' }, t('local.subtitle')),
          ),
          h(
            'div',
            { className: 'tiana-head-actions' },
            h(SandboxToggleSwitch, {
              t,
              capability: sandboxCapability,
              enabled: sandboxEnabled,
              onChange: onToggleSandbox,
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'tiana-icon-btn',
                onClick: onRefresh,
                disabled: loading,
                title: t('local.refresh'),
                'aria-label': t('local.refresh'),
              },
              h(Icon, { name: 'refresh', size: 16 }),
            ),
          ),
        ),
        actionError === null
          ? null
          : h('p', { className: 'tiana-auth-warn' }, actionError),
        loading && items.length === 0
          ? h(
              'div',
              { className: 'tiana-state' },
              h(Spinner, null),
              h('div', { className: 'tiana-state-title' }, t('local.title')),
            )
          : error !== null
            ? h(StateView, {
                title: t('local.loadError'),
                message: error.message,
                retryLabel: t('local.retry'),
                onRetry: onRefresh,
              })
            : items.length === 0
              ? h(EmptyState, { title: t('local.empty'), hint: t('local.emptyHint') })
              : h(
                  React.Fragment,
                  null,
                  h(
                    'div',
                    { className: 'tiana-local-list' },
                    items.map((workspace) => {
                      const status = workspace.status ?? 'stopped';
                      const statusLabel = t(`local.status.${status}`);
                      const cover = typeof workspace.template === 'string' && workspace.template.length > 0
                        ? `/tiana/api/template-cover?name=${encodeURIComponent(workspace.template)}`
                        : null;
                      return h(
                        'article',
                        { key: workspace.id, className: 'tiana-local-row' },
                        h(
                          'div',
                          { className: 'tiana-local-thumb', 'aria-hidden': true },
                          cover === null
                            ? h('span', { className: 'tiana-local-thumb-fallback' }, workspace.title.slice(0, 1))
                            : h('img', {
                                src: cover,
                                alt: '',
                                loading: 'lazy',
                                decoding: 'async',
                                onError: (event) => {
                                  const image = event.currentTarget;
                                  image.style.display = 'none';
                                  const fallback = image.parentElement?.querySelector('.tiana-local-thumb-fallback');
                                  if (fallback) fallback.style.display = 'flex';
                                },
                              }),
                          h('span', { className: 'tiana-local-thumb-fallback', style: { display: 'none' } }, workspace.title.slice(0, 1)),
                        ),
                        h(
                          'div',
                          { className: 'tiana-local-main' },
                          h(
                            'div',
                            { className: 'tiana-local-card-head' },
                            h('div', { className: 'tiana-local-title', title: workspace.title }, workspace.title),
                            h(
                              'span',
                              { className: `tiana-local-status tiana-local-status-${status}` },
                              statusLabel,
                            ),
                          ),
                          h('div', { className: 'tiana-local-path', title: workspace.directory }, workspace.directory),
                          h(
                            'div',
                            { className: 'tiana-local-meta' },
                            workspace.dshWorkspace?.ok
                              ? h('span', null, `${t('local.workspace')}: ${workspace.dshWorkspace.title}`)
                              : null,
                            status === 'ready' && workspace.sandbox
                              ? h(
                                  'span',
                                  {
                                    className: workspace.sandbox.confined ? 'tiana-local-sandbox-ok' : 'tiana-local-sandbox-warn',
                                    title: workspace.sandbox.confined
                                      ? (workspace.sandbox.enforcement || t('local.sandbox.confined'))
                                      : (workspace.sandbox.reason || t('local.sandbox.unconfined')),
                                  },
                                  workspace.sandbox.confined
                                    ? `${t('local.sandbox.confined')}${workspace.sandbox.enforcement ? ` (${workspace.sandbox.enforcement})` : ''}`
                                    : t('local.sandbox.unconfined'),
                                )
                              : null,
                            h('span', null, `${t('local.created')}: ${formatDate(workspace.createdAt)}`),
                          ),
                          workspace.warning
                            ? h('p', { className: 'tiana-local-warn', title: workspace.warning }, workspace.warning)
                            : null,
                          status === 'failed' && workspace.error
                            ? h('p', { className: 'tiana-local-error', title: workspace.error }, workspace.error)
                            : null,
                        ),
                        h(
                          'div',
                          { className: 'tiana-local-actions', 'aria-busy': status === 'preparing' },
                          status === 'ready' && workspace.previewUrl
                            ? h(
                                'a',
                                {
                                  className: 'tiana-btn tiana-btn-primary tiana-btn-small',
                                  href: workspace.previewUrl,
                                  target: '_blank',
                                  rel: 'noopener noreferrer',
                                },
                                t('local.openPreview'),
                              )
                            : status === 'preparing'
                              ? h(
                                  'button',
                                  { type: 'button', className: 'tiana-btn tiana-btn-primary tiana-btn-small', disabled: true },
                                  t('local.building'),
                                )
                              : h(
                                  'button',
                                  {
                                    type: 'button',
                                    className: 'tiana-btn tiana-btn-primary tiana-btn-small',
                                    onClick: () => startPreview(workspace),
                                    disabled: busyId !== null,
                                  },
                                  busyId === workspace.id
                                    ? t('local.building')
                                    : status === 'failed'
                                      ? t('local.retryPreview')
                                      : t('local.startPreview'),
                                ),
                          workspace.dshWorkspace?.ok
                            ? h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'tiana-btn tiana-btn-ghost tiana-btn-small',
                                  onClick: () => openSession(workspace),
                                  disabled: busyId !== null,
                                },
                                t('local.openSession'),
                              )
                            : null,
                          status === 'ready' ? h(
                            'div', { className: 'tiana-preview-tools', role: 'group', 'aria-label': t('preview.title') },
                            h('button', {
                              type: 'button', className: 'tiana-icon-btn', title: t('templates.retryBuild'),
                              'aria-label': t('templates.retryBuild'), disabled: busyId !== null,
                              onClick: () => startPreview(workspace),
                            }, h(Icon, { name: 'refresh', size: 15 })),
                            h('button', {
                              type: 'button', className: 'tiana-icon-btn tiana-stop-preview', title: t('local.stopPreview'),
                              'aria-label': t('local.stopPreview'), disabled: busyId !== null,
                              onClick: () => stopPreview(workspace),
                            }, h(Icon, { name: 'stop', size: 14 })),
                          ) : null,
                        ),
                      );
                    }),
                  ),
                  h(
                    'p',
                    { className: 'tiana-list-footer' },
                    `${items.length} ${t('local.count')}`,
                  ),
                ),
      );
    }

    function TianaInstallComplete({ t, sessionId }) {
      const [notice, setNotice] = React.useState(() => readInstallNotice());
      const [workspace, setWorkspace] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [opened, setOpened] = React.useState(false);
      const dialogRef = React.useRef(null);
      const shouldOpenRef = React.useRef(false);
      const aliveRef = React.useRef(true);
      const active = notice !== null && notice.sessionId === sessionId;

      React.useEffect(() => {
        const sync = () => setNotice(readInstallNotice());
        sync();
        window.addEventListener('tiana:install-complete', sync);
        window.addEventListener('storage', sync);
        return () => {
          window.removeEventListener('tiana:install-complete', sync);
          window.removeEventListener('storage', sync);
        };
      }, []);

      React.useEffect(() => {
        if (!active) return undefined;
        const dialog = dialogRef.current;
        if (dialog !== null && !dialog.open) {
          try {
            dialog.showModal();
          } catch {
            // The native dialog can fail while re-parenting; a later render retries.
          }
        }
        return undefined;
      }, [active, notice]);

      React.useEffect(() => {
        if (!active) return undefined;
        aliveRef.current = true;
        setWorkspace(null);
        setBusy(false);
        setError(null);
        setOpened(false);
        void tianaFetch(`/tiana/api/workspaces/status?id=${encodeURIComponent(notice.workspaceId)}`)
          .then((payload) => {
            if (!aliveRef.current) return;
            if (payload.error) throw new Error(payload.error.message);
            setWorkspace(payload.workspace ?? null);
          })
          .catch((cause) => {
            if (aliveRef.current) setError(cause instanceof Error ? cause.message : String(cause));
          });
        return () => {
          aliveRef.current = false;
          shouldOpenRef.current = false;
        };
      }, [active, notice]);

      React.useEffect(() => {
        if (!active || workspace?.status !== 'preparing') return undefined;
        const timer = setTimeout(async () => {
          try {
            const payload = await tianaFetch(
              `/tiana/api/workspaces/status?id=${encodeURIComponent(notice.workspaceId)}`,
            );
            if (!aliveRef.current) return;
            if (payload.error) throw new Error(payload.error.message);
            setWorkspace(payload.workspace ?? null);
          } catch (cause) {
            if (aliveRef.current) setError(cause instanceof Error ? cause.message : String(cause));
          }
        }, 1000);
        return () => clearTimeout(timer);
      }, [active, notice, workspace]);

      React.useEffect(() => {
        if (!active || workspace === null) return;
        if (workspace.status === 'ready' && workspace.previewUrl) {
          setBusy(false);
          if (shouldOpenRef.current) {
            shouldOpenRef.current = false;
            if (openPreviewWindow(workspace.previewUrl)) setOpened(true);
            else setError(t('local.popupBlocked'));
          }
          if (!workspace.previewUrl) setError(t('installComplete.error'));
          return;
        }
        if (workspace.status === 'failed') {
          setBusy(false);
          setError(workspace.error || t('installComplete.error'));
          shouldOpenRef.current = false;
        }
      }, [active, workspace, t]);

      const dismiss = () => {
        clearInstallNotice();
        setNotice(null);
        shouldOpenRef.current = false;
        const dialog = dialogRef.current;
        if (dialog !== null && dialog.open) dialog.close();
      };

      const openPreview = async () => {
        if (!active || busy || notice === null) return;
        if (workspace?.status === 'ready' && workspace.previewUrl) {
          if (openPreviewWindow(workspace.previewUrl)) setOpened(true);
          else setError(t('local.popupBlocked'));
          return;
        }
        shouldOpenRef.current = true;
        setBusy(true);
        setOpened(false);
        setError(null);
        try {
          const prepParams = new URLSearchParams({ id: notice.workspaceId });
          if (!readSandboxPreference()) prepParams.set('sandbox', 'off');
          const payload = await tianaFetch(
            `/tiana/api/workspaces/prepare?${prepParams.toString()}`,
            { method: 'POST' },
          );
          if (payload.error || !payload.workspace) {
            throw new Error(payload.error?.message || t('installComplete.error'));
          }
          setWorkspace(payload.workspace);
        } catch (cause) {
          shouldOpenRef.current = false;
          setBusy(false);
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      };

      if (!active) return null;
      const ready = workspace?.status === 'ready' && typeof workspace.previewUrl === 'string';
      const preparing = busy || workspace?.status === 'preparing';
      const label = preparing
        ? t('installComplete.building')
        : ready
          ? t('installComplete.openPreview')
          : workspace?.status === 'failed'
            ? t('installComplete.retry')
            : t('installComplete.startPreview');

      return h(
        'dialog',
        {
          ref: dialogRef,
          className: 'tiana-install-complete',
          'aria-label': t('installComplete.title'),
          onCancel: (event) => {
            event.preventDefault();
            dismiss();
          },
          style: {
            border: 'none',
            borderRadius: '14px',
            padding: 0,
            width: 'min(560px, calc(100vw - 32px))',
            maxHeight: 'calc(100vh - 32px)',
            overflow: 'auto',
            background: 'var(--dsw-alias-bg-layer-1)',
            color: 'var(--dsw-alias-label-primary)',
            boxShadow: 'var(--dsw-elevation-panel, 0 20px 60px rgba(0,0,0,0.28))',
          },
        },
        h(
          'style',
          null,
          '.tiana-install-complete::backdrop{background:rgba(0,0,0,.38);backdrop-filter:blur(2px)}' +
            '.tiana-install-complete .tiana-btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 13px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}' +
            '.tiana-install-complete .tiana-btn-primary{background:var(--dsw-alias-state-business-primary, #5265ff);border-color:transparent;color:#fff}' +
            '.tiana-install-complete .tiana-btn-ghost{color:var(--dsw-alias-label-secondary)}' +
            '.tiana-install-complete .tiana-btn:disabled{opacity:.55;cursor:default}' +
            '.tiana-install-complete .tiana-icon-btn{display:inline-grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}' +
            '.tiana-install-complete .tiana-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}' +
            '.tiana-install-complete .tiana-spinner{width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:tiana-spin .8s linear infinite}' +
            '@keyframes tiana-spin{to{transform:rotate(360deg)}}',
        ),
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '12px', padding: '22px 24px 20px' } },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' } },
            h(
              'div',
              null,
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '4px' } },
                h(Icon, { name: 'download', size: 20 }),
                h('h2', { style: { margin: 0, fontSize: '17px', lineHeight: '24px' } }, t('installComplete.title')),
              ),
              h('div', { style: { fontSize: '13px', fontWeight: 600 } }, notice.title),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'tiana-icon-btn',
                onClick: dismiss,
                'aria-label': t('common.close'),
                title: t('common.close'),
              },
              h(Icon, { name: 'x', size: 16 }),
            ),
          ),
          h('p', { style: { margin: 0, fontSize: '13px', lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' } }, t('installComplete.body')),
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
            h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)' } }, t('installComplete.path')),
            h('code', { style: { fontSize: '12px', lineHeight: '18px', overflowWrap: 'anywhere', color: 'var(--dsw-alias-label-secondary)' } }, notice.directory),
          ),
          h(
            'div',
            {
              style: {
                border: '1px solid var(--dsw-alias-border-l1)',
                borderRadius: '10px',
                padding: '10px 12px',
                fontSize: '12px',
                lineHeight: '19px',
                color: 'var(--dsw-alias-label-secondary)',
              },
            },
            h('div', null, t('installComplete.teach')),
            h('div', { style: { marginTop: '4px', color: 'var(--dsw-alias-label-tertiary)' } }, t('installComplete.localProjects')),
          ),
          workspace?.warning
            ? h('p', { style: { margin: 0, padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--dsw-alias-state-warn-primary, #d99b26)', fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-state-warn-primary, #d99b26)' } }, workspace.warning)
            : null,
          opened
            ? h('p', { style: { margin: 0, fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, t('installComplete.opened'))
            : null,
          error === null
            ? null
            : h('p', { style: { margin: 0, fontSize: '12px', color: 'var(--dsw-alias-state-error-primary, #d05b5b)' } }, error),
          h(
            'div',
            { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' } },
            h(
              'button',
              { type: 'button', className: 'tiana-btn tiana-btn-ghost', onClick: dismiss },
              t('installComplete.close'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'tiana-btn tiana-btn-primary',
                onClick: openPreview,
                disabled: preparing,
              },
              preparing ? h(Spinner, null) : null,
              label,
            ),
          ),
        ),
      );
    }

    function TianaPanel({ t, initialSection = 'templates', onOpenSession }) {
      const [section, setSection] = React.useState(initialSection);
      const [siteTab, setSiteTab] = React.useState('mine');
      const [siteQuery, setSiteQuery] = React.useState('');
      const [templateQuery, setTemplateQuery] = React.useState('');
      const [templateCategory, setTemplateCategory] = React.useState('all');
      const [notice, setNotice] = React.useState(null);
      const [auth, setAuth] = React.useState({ phase: 'checking', error: null });
      const [login, setLogin] = React.useState(null);
      const [sitesData, setSitesData] = React.useState({ loading: false, items: [], error: null, page: 1, total: 0, totalPages: 0 });
      const siteRequestRef = React.useRef(0);
      const siteBusyRef = React.useRef(false);
      const siteRetryRef = React.useRef(1);
      const [spacesData, setSpacesData] = React.useState({
        loading: false,
        items: [],
        currentTenantId: null,
        switching: null,
        error: null,
      });
      const localRequestRef = React.useRef(0);
      const [localData, setLocalData] = React.useState({ loading: true, items: [], sandbox: null, error: null });
      const [sandboxEnabled, setSandboxEnabled] = React.useState(() => readSandboxPreference());

      React.useEffect(() => {
        const sync = () => setSandboxEnabled(readSandboxPreference());
        window.addEventListener('tiana:sandbox-pref', sync);
        window.addEventListener('storage', sync);
        return () => {
          window.removeEventListener('tiana:sandbox-pref', sync);
          window.removeEventListener('storage', sync);
        };
      }, []);
      const [templateInitialCache] = React.useState(() => readTemplateCatalogCache());
      const [templatesData, setTemplatesData] = React.useState(() => (
        templatesDataFromCache(templateInitialCache) ?? {
          page: 1,
          loading: true,
          loadingMore: false,
          items: [],
          categories: [],
          nextCursor: null,
          origin: null,
          error: null,
          moreError: null,
        }
      ));
      const loginStartingRef = React.useRef(false);
      // Bumped on every start/cancel so a cancelled sign-in cannot resurrect itself.
      const loginAttemptRef = React.useRef(0);
      const loginPopupRef = React.useRef(null);
      // Space chosen before the CLI demanded a new sign-in; applied once after approval.
      const pendingSpaceRef = React.useRef(null);
      const switchSpaceRef = React.useRef(null);
      const startLoginRef = React.useRef(null);
      const switchingSpaceRef = React.useRef(false);
      const spacesRequestRef = React.useRef(0);
      const templateRequestRef = React.useRef(0);
      const templateLoadingMoreRef = React.useRef(false);
      const templateCursorsRef = React.useRef(['']);
      const templateRetryRef = React.useRef(null);
      const templateCacheSkipRef = React.useRef(templateInitialCache !== null);

      const authenticated = auth.phase === 'authenticated';

      const checkStatus = React.useCallback(async () => {
        setAuth({ phase: 'checking', error: null });
        try {
          const payload = await tianaFetch('/tiana/api/status');
          if (payload.loggedIn === true) {
            setAuth({ phase: 'authenticated', error: null });
            return;
          }
          if (payload.error && payload.error.code !== 'AUTH_REQUIRED') {
            setAuth({ phase: 'error', error: payload.error });
            return;
          }
          setAuth({ phase: 'anonymous', error: null });
        } catch (error) {
          setAuth({
            phase: 'error',
            error: { code: 'STATUS_FAILED', message: error.message, nextAction: '' },
          });
        }
      }, []);

      const loadSites = React.useCallback(async (page = 1) => {
        if (siteBusyRef.current || switchingSpaceRef.current) return;
        siteBusyRef.current = true;
        const requestId = ++siteRequestRef.current;
        siteRetryRef.current = page;
        setSitesData((current) => ({ ...current, loading: true, error: null }));
        try {
          const params = new URLSearchParams({ page: String(page) });
          if (siteQuery.trim()) params.set('q', siteQuery.trim());
          const payload = await tianaFetch(`/tiana/api/sites?${params}`);
          if (requestId !== siteRequestRef.current) return;
          if (payload.error) throw Object.assign(new Error(payload.error.message), { payload });
          setSitesData({ loading: false, items: (payload.items ?? []).map(mapSite), error: null,
            page: payload.page, total: payload.total, totalPages: payload.totalPages });
        } catch (error) {
          if (requestId !== siteRequestRef.current) return;
          setSitesData((current) => ({ ...current, loading: false,
            error: error.payload?.error ?? { code: 'SITES_FAILED', message: error.message } }));
        } finally {
          if (requestId === siteRequestRef.current) siteBusyRef.current = false;
        }
      }, [siteQuery]);

      const loadLocalProjects = React.useCallback(async (silent = false) => {
        const requestId = ++localRequestRef.current;
        if (!silent) setLocalData((current) => ({ ...current, loading: true, error: null }));
        try {
          const payload = await tianaFetch('/tiana/api/workspaces');
          if (requestId !== localRequestRef.current) return;
          if (payload.error) throw new Error(payload.error.message || 'Local projects failed.');
          setLocalData({
            loading: false,
            items: Array.isArray(payload.items) ? payload.items : [],
            sandbox: payload.sandbox ?? { supported: false, enforcement: null, reason: null },
            error: null,
          });
        } catch (error) {
          if (requestId !== localRequestRef.current) return;
          setLocalData((current) => ({
            ...current,
            loading: false,
            error: { code: 'LOCAL_PROJECTS_FAILED', message: error instanceof Error ? error.message : String(error) },
          }));
        }
      }, []);

      const loadSpaces = React.useCallback(async () => {
        const requestId = ++spacesRequestRef.current;
        setSpacesData((current) => ({ ...current, loading: true, error: null }));
        try {
          const payload = await tianaFetch('/tiana/api/spaces');
          if (requestId !== spacesRequestRef.current) return;
          if (payload.error) {
            throw Object.assign(new Error(payload.error.message || 'Could not load Tiana spaces.'), { payload });
          }
          setSpacesData((current) => ({
            loading: false,
            items: Array.isArray(payload.items) ? payload.items : [],
            currentTenantId: typeof payload.currentTenantId === 'string' ? payload.currentTenantId : null,
            switching: current.switching,
            error: null,
          }));
        } catch (error) {
          if (requestId !== spacesRequestRef.current) return;
          setSpacesData((current) => ({
            ...current,
            loading: false,
            switching: current.switching,
            error: error.payload?.error ?? {
              code: 'SPACES_FAILED',
              message: error instanceof Error ? error.message : String(error),
            },
          }));
        }
      }, []);

      const switchSpace = React.useCallback(async (tenantId, { afterLogin = false } = {}) => {
        if (switchingSpaceRef.current || typeof tenantId !== 'string' || tenantId.length === 0 || tenantId === spacesData.currentTenantId) return;
        switchingSpaceRef.current = true;
        spacesRequestRef.current += 1;
        siteRequestRef.current += 1;
        siteBusyRef.current = false;
        setSitesData({ loading: false, items: [], error: null, page: 1, total: 0, totalPages: 0 });
        setSpacesData((current) => ({ ...current, switching: tenantId, error: null }));
        try {
          // Browser approval may already have selected the requested space.
          if (afterLogin) {
            const current = await tianaFetch('/tiana/api/spaces');
            if (current.ok === true && !current.error && current.currentTenantId === tenantId) {
              await loadSpaces();
              return true;
            }
          }
          const payload = await tianaFetch(
            `/tiana/api/spaces/switch?id=${encodeURIComponent(tenantId)}`,
            { method: 'POST' },
          );
          if (payload.ok !== true || payload.error) {
            throw Object.assign(new Error(payload.error?.message || 'Could not switch Tiana space.'), { payload });
          }
          setSpacesData((current) => ({ ...current, currentTenantId: payload.tenantId }));
          await loadSpaces();
          return true;
        } catch (error) {
          const requiresLogin = error.payload?.requiresLogin === true;
          const switchError = error.payload?.error ?? {
            code: 'SPACE_SWITCH_FAILED',
            message: error instanceof Error ? error.message : String(error),
          };
          setSpacesData((current) => ({
            ...current,
            switching: null,
            error: requiresLogin && !afterLogin ? null : switchError,
          }));
          switchingSpaceRef.current = false;
          if (requiresLogin) {
            setAuth({ phase: 'anonymous', error: afterLogin ? switchError : null });
            setSitesData({ loading: false, items: [], error: null, page: 1, total: 0, totalPages: 0 });
            if (afterLogin) {
              setNotice(error.message);
            } else {
              pendingSpaceRef.current = tenantId;
              void startLoginRef.current?.();
            }
          }
          return !requiresLogin;
        } finally {
          switchingSpaceRef.current = false;
          setSpacesData((current) => ({ ...current, switching: null }));
        }
      }, [loadSpaces, spacesData.currentTenantId]);
      switchSpaceRef.current = switchSpace;

      React.useEffect(() => {
        if (!authenticated) {
          spacesRequestRef.current += 1;
          setSpacesData({ loading: false, items: [], currentTenantId: null, switching: null, error: null });
          return undefined;
        }
        void loadSpaces();
        return undefined;
      }, [authenticated, loadSpaces]);

      React.useEffect(() => {
        void loadLocalProjects();
      }, [loadLocalProjects]);

      React.useEffect(() => {
        if (section !== 'local') return undefined;
        void loadLocalProjects(true);
        return undefined;
      }, [section, loadLocalProjects]);

      React.useEffect(() => {
        if (localData.loading) return undefined;
        const preparing = localData.items.some(item => item.status === 'preparing');
        if (section !== 'local' && !preparing) return undefined;
        const timer = setTimeout(() => void loadLocalProjects(true), preparing ? 1500 : 3000);
        return () => clearTimeout(timer);
      }, [section, localData, loadLocalProjects]);

      const prepareLocal = React.useCallback(async (id, sandboxOff = false) => {
        const params = new URLSearchParams({ id });
        if (sandboxOff) params.set('sandbox', 'off');
        const payload = await tianaFetch(
          `/tiana/api/workspaces/prepare?${params.toString()}`,
          { method: 'POST' },
        );
        if (payload.error || !payload.workspace) {
          throw new Error(payload.error?.message || 'Local preview did not start.');
        }
        setLocalData((current) => ({
          ...current,
          items: current.items.map((item) => (item.id === id ? payload.workspace : item)),
        }));
        return payload.workspace;
      }, []);

      const deleteSite = React.useCallback(async (site) => {
        const payload = await tianaFetch(
          `/tiana/api/sites/delete?id=${encodeURIComponent(site.id)}`,
          { method: 'POST' },
        );
        if (payload.ok !== true || payload.error) {
          throw new Error(payload.error?.message || 'Tiana site deletion did not succeed.');
        }
        setSitesData((current) => ({
          ...current,
          items: current.items.filter((item) => item.id !== site.id),
        }));
        siteBusyRef.current = false;
        void loadSites(sitesData.items.length === 1 ? Math.max(1, sitesData.page - 1) : sitesData.page);
        setNotice('sites.noticeDeleted');
      }, [loadSites, sitesData.items.length, sitesData.page]);

      const loadTemplatePage = React.useCallback(async ({ query, category, after, reset, page = 1 }) => {
        templateRetryRef.current = { query, category, after, reset, page };
        const requestId = ++templateRequestRef.current;
        if (reset) {
          templateCursorsRef.current = [''];
          templateLoadingMoreRef.current = false;
          setTemplatesData((current) => ({
            ...current,
            loading: true,
            loadingMore: false,
            items: [],
            nextCursor: null,
            error: null,
            moreError: null,
          }));
        } else {
          templateLoadingMoreRef.current = true;
          setTemplatesData((current) => ({
            ...current,
            loadingMore: true,
            moreError: null,
          }));
        }

        try {
          const params = new URLSearchParams();
          if (after) params.set('after', after);
          if (category !== 'all') params.set('category', category);
          if (query) params.set('q', query);
          const payload = await tianaFetch(
            `/tiana/api/templates${params.size === 0 ? '' : `?${params.toString()}`}`,
          );
          if (requestId !== templateRequestRef.current) return;
          if (payload.error) {
            throw Object.assign(new Error(payload.error.message || 'Template catalog failed.'), { payload });
          }

          if (payload.nextCursor && payload.nextCursor === after) throw new Error('Template cursor did not advance.');
          templateCursorsRef.current[page - 1] = after;
          const responseCategories = Array.isArray(payload.categories) ? payload.categories : [];
          if (reset && after === '' && query === '' && category === 'all' && !payload.error) {
            writeTemplateCatalogCache({
              items: payload.items,
              categories: responseCategories,
              nextCursor: payload.nextCursor,
              origin: payload.origin,
            });
          }
          setTemplatesData((current) => {
            const categories = responseCategories.length > 0 ? responseCategories : current.categories;
            const categoryNames = new Map(categories.map((item) => [String(item.id), item.name]));
            const offset = (page - 1) * 18;
            const mapped = (payload.items ?? []).map((item, index) => mapTemplate(item, offset + index, categoryNames));
            return {
              loading: false,
              loadingMore: false,
              page,
              items: reset ? mapped : [...new Map([...current.items, ...mapped].map(item => [item.id, item])).values()],
              categories,
              nextCursor: payload.nextCursor ?? null,
              origin: typeof payload.origin === 'string' ? payload.origin : current.origin,
              error: null,
              moreError: null,
            };
          });

          if (responseCategories.length > 0) {
            setTemplateCategory((current) => {
              if (current === 'all') return current;
              return responseCategories.some((item) => String(item.id) === current) ? current : 'all';
            });
          }
        } catch (error) {
          if (requestId !== templateRequestRef.current) return;
          const payloadError = error.payload?.error ?? {
            code: 'TEMPLATES_FAILED',
            message: error instanceof Error ? error.message : String(error),
          };
          if (reset) {
            setTemplatesData((current) => ({
              ...current,
              loading: false,
              loadingMore: false,
              items: [],
              nextCursor: null,
              error: payloadError,
              moreError: null,
            }));
          } else {
            setTemplatesData((current) => ({
              ...current,
              loadingMore: false,
              moreError: payloadError,
            }));
          }
        } finally {
          if (requestId === templateRequestRef.current) {
            templateLoadingMoreRef.current = false;
          }
        }
      }, []);

      React.useEffect(() => {
        void checkStatus();
      }, [checkStatus]);

      React.useEffect(() => {
        if (section !== 'templates') return undefined;
        if (
          templateCacheSkipRef.current
          && templateQuery.trim() === ''
          && templateCategory === 'all'
          && templatesData.items.length > 0
        ) {
          templateCacheSkipRef.current = false;
          return undefined;
        }
        templateCacheSkipRef.current = false;
        templateRequestRef.current += 1;
        templateLoadingMoreRef.current = false;
        setTemplatesData((current) => ({
          ...current,
          loading: true,
          loadingMore: false,
          nextCursor: null,
          error: null,
          moreError: null,
        }));
        const timer = setTimeout(() => {
          void loadTemplatePage({
            query: templateQuery.trim(),
            category: templateCategory,
            after: '',
            reset: true,
          });
        }, 250);
        return () => {
          clearTimeout(timer);
          templateRequestRef.current += 1;
        };
      }, [section, templateQuery, templateCategory, loadTemplatePage]);

      React.useEffect(() => {
        siteRequestRef.current += 1;
        siteBusyRef.current = false;
        setSitesData({ loading: authenticated, items: [], error: null, page: 1, total: 0, totalPages: 0 });
        if (section !== 'sites' || !authenticated || spacesData.switching !== null) return undefined;
        const timer = setTimeout(() => { void loadSites(); }, 250);
        return () => {
          clearTimeout(timer);
          siteRequestRef.current += 1;
          siteBusyRef.current = false;
        };
      }, [section, authenticated, loadSites, spacesData.currentTenantId, spacesData.switching]);

      React.useEffect(() => {
      }, [authenticated]);

      React.useEffect(() => {
        if (notice === null) return undefined;
        const timer = setTimeout(() => setNotice(null), 4200);
        return () => clearTimeout(timer);
      }, [notice]);

      const loadMoreTemplates = React.useCallback(() => {
        if (
          templateLoadingMoreRef.current
          || templatesData.loading
          || templatesData.nextCursor === null
        ) {
          return;
        }
        templateLoadingMoreRef.current = true;
        void loadTemplatePage({
          query: templateQuery.trim(),
          category: templateCategory,
          after: templatesData.nextCursor,
          page: (templatesData.page ?? 1) + 1,
          reset: false,
        });
      }, [
        templatesData.loading,
        templatesData.nextCursor,
        templatesData.page,
        templateQuery,
        templateCategory,
        loadTemplatePage,
      ]);

      const retryTemplates = React.useCallback(() => {
        void loadTemplatePage({
          query: templateQuery.trim(),
          category: templateCategory,
          after: '',
          reset: true,
        });
      }, [templateQuery, templateCategory, loadTemplatePage]);

      const startLogin = React.useCallback(async () => {
        if (loginStartingRef.current) return;
        loginStartingRef.current = true;
        const attempt = ++loginAttemptRef.current;
        try {
          const popup = openAuthWindow('about:blank');
          loginPopupRef.current = popup;
          const popupBlocked = popup === null;
          setLogin({
            loading: true,
            verificationUri: null,
            retryAfter: 2,
            error: null,
            copied: false,
            openFailed: popupBlocked,
            autoOpened: !popupBlocked,
          });
          setAuth({ phase: 'starting', error: null });
          try {
            const payload = await tianaFetch('/tiana/api/login/start', { method: 'POST' });
            if (attempt !== loginAttemptRef.current) return;
            if (payload.loggedIn === true) {
              closeAuthWindow(popup);
              loginPopupRef.current = null;
              const target = pendingSpaceRef.current;
              pendingSpaceRef.current = null;
              const ready = target === null || await switchSpaceRef.current?.(target, { afterLogin: true });
              if (attempt !== loginAttemptRef.current) return;
              setLogin(null);
              if (ready) setAuth({ phase: 'authenticated', error: null });
              return;
            }
            if (payload.pending === true && typeof payload.verificationUri === 'string') {
              let openFailed = popupBlocked;
              if (!openFailed) {
                if (popup.closed) {
                  openFailed = true;
                } else {
                  try {
                    popup.location.href = payload.verificationUri;
                  } catch {
                    openFailed = true;
                  }
                }
              }
              setLogin({
                loading: false,
                verificationUri: payload.verificationUri,
                retryAfter: typeof payload.retryAfter === 'number' ? payload.retryAfter : 2,
                expiresAt: payload.expiresAt ?? null,
                error: null,
                copied: false,
                openFailed,
                autoOpened: !openFailed,
              });
              setAuth({ phase: 'pending', error: null });
              return;
            }
            closeAuthWindow(popup);
            setLogin({
              loading: false,
              verificationUri: null,
              retryAfter: 2,
              error: payload.error ?? { code: 'LOGIN_START_FAILED', message: 'Login did not start.' },
              copied: false,
              openFailed: false,
              autoOpened: false,
            });
            setAuth({ phase: 'anonymous', error: null });
          } catch (error) {
            if (attempt !== loginAttemptRef.current) return;
            closeAuthWindow(popup);
            setLogin({
              loading: false,
              verificationUri: null,
              retryAfter: 2,
              error: { code: 'LOGIN_START_FAILED', message: error.message },
              copied: false,
              openFailed: false,
              autoOpened: false,
            });
            setAuth({ phase: 'anonymous', error: null });
          }
        } finally {
          if (attempt === loginAttemptRef.current) loginStartingRef.current = false;
        }
      }, []);
      startLoginRef.current = startLogin;

      const cancelLogin = React.useCallback(() => {
        loginAttemptRef.current += 1;
        loginStartingRef.current = false;
        pendingSpaceRef.current = null;
        closeAuthWindow(loginPopupRef.current);
        loginPopupRef.current = null;
        setLogin(null);
        // A cancelled space re-auth may still hold the old space's session.
        void checkStatus();
      }, [checkStatus]);

      React.useEffect(() => {
        if (auth.phase !== 'pending' || !login?.verificationUri || login?.error) return undefined;
        const attempt = loginAttemptRef.current;
        let cancelled = false;
        let timer;

        const schedule = (seconds) => {
          clearTimeout(timer);
          timer = setTimeout(poll, Math.max(2, Math.min(seconds ?? 2, 5)) * 1000);
        };

        const poll = async () => {
          try {
            const payload = await tianaFetch('/tiana/api/login/resume', { method: 'POST' });
            if (cancelled) return;
            if (payload.loggedIn === true) {
              closeAuthWindow(loginPopupRef.current);
              loginPopupRef.current = null;
              const target = pendingSpaceRef.current;
              pendingSpaceRef.current = null;
              const ready = target === null || await switchSpaceRef.current?.(target, { afterLogin: true });
              if (cancelled || attempt !== loginAttemptRef.current) return;
              setLogin(null);
              if (ready) setAuth({ phase: 'authenticated', error: null });
              return;
            }
            if (payload.pending === true) {
              schedule(payload.retryAfter);
              return;
            }
            if (payload.error) {
              setLogin((current) => (current === null ? current : { ...current, error: payload.error }));
              return;
            }
            schedule(3);
          } catch {
            if (!cancelled) schedule(3);
          }
        };

        schedule(login.retryAfter);
        return () => {
          cancelled = true;
          clearTimeout(timer);
        };
      }, [auth.phase, login?.verificationUri, login?.retryAfter, login?.error]);

      const openLogin = React.useCallback(() => {
        if (!login?.verificationUri) return;
        const popup = openAuthWindow(login.verificationUri);
        loginPopupRef.current = popup;
        if (popup === null) {
          setLogin((current) => (current === null ? current : { ...current, openFailed: true, autoOpened: false }));
        } else {
          setLogin((current) => (current === null ? current : { ...current, openFailed: false, autoOpened: true }));
        }
      }, [login?.verificationUri]);

      const copyLogin = React.useCallback(async () => {
        if (!login?.verificationUri) return;
        try {
          await navigator.clipboard.writeText(login.verificationUri);
          setLogin((current) => (current === null ? current : { ...current, copied: true }));
          setTimeout(() => {
            setLogin((current) => (current === null ? current : { ...current, copied: false }));
          }, 2000);
        } catch {
          // The URL is visible in the card for manual copying.
        }
      }, [login?.verificationUri]);

      const directLogin = React.useCallback(() => {
        if (auth.phase === 'pending' && login?.verificationUri) {
          openLogin();
          return;
        }
        void startLogin();
      }, [auth.phase, login?.verificationUri, openLogin, startLogin]);

      const settingsUrl = React.useMemo(() => {
        if (typeof templatesData.origin !== 'string' || templatesData.origin.length === 0) return null;
        try {
          return withAcquisitionSource(`${new URL(templatesData.origin).origin}/console/settings`);
        } catch {
          return null;
        }
      }, [templatesData.origin]);

      const logout = React.useCallback(async () => {
        siteRequestRef.current += 1;
        siteBusyRef.current = false;
        try {
          await tianaFetch('/tiana/api/logout', { method: 'POST' });
          setAuth({ phase: 'anonymous', error: null });
          setLogin(null);
          setSitesData({ loading: false, items: [], error: null, page: 1, total: 0, totalPages: 0 });
        } catch (error) {
          setNotice(error.message);
        }
      }, []);

      const sites = React.useMemo(() => {
        if (!authenticated) return [];
        return siteTab === 'shared' ? [] : sitesData.items;
      }, [authenticated, sitesData.items, siteTab]);

      const switchSection = (next) => {
        setSection(next);
        setNotice(null);
      };

      return h(
        'section',
        { className: 'tiana-root', 'aria-label': t('panel') },
        h('style', { key: 'tiana-styles' }, CSS_TEXT),
        h(
          'aside',
          { className: 'tiana-nav' },
          h(
            'nav',
            { className: 'tiana-nav-items', 'aria-label': t('nav.label') },
            h(NavItem, {
              active: section === 'templates',
              icon: 'layout',
              label: t('nav.templates'),
              onClick: () => switchSection('templates'),
            }),
            h(NavItem, {
              active: section === 'sites',
              icon: 'globe',
              label: t('nav.sites'),
              onClick: () => switchSection('sites'),
            }),
            h(NavItem, {
              active: section === 'local',
              icon: 'grid',
              label: t('nav.local'),
              onClick: () => switchSection('local'),
            }),
          ),
          h('div', { className: 'tiana-nav-grow' }),
          h(
            'div',
            { className: 'tiana-nav-bottom' },
            h(AccountBadge, {
              t,
              auth,
              onLogout: logout,
              onLogin: directLogin,
              onCancelLogin: cancelLogin,
              spaces: spacesData.items,
              currentSpaceId: spacesData.currentTenantId,
              spacesLoading: spacesData.loading,
              switchingSpace: spacesData.switching,
              spaceError: spacesData.error,
              onSwitchSpace: switchSpace,
              settingsUrl,
            }),
            h('div', { className: 'tiana-nav-footer' }, t('nav.footer')),
          ),
        ),
        h(
          'div',
          { className: 'tiana-content' },
          h(
            'div',
            { className: 'tiana-content-scroll' },
            section === 'local'
              ? h(LocalProjectsView, {
                  t,
                  items: localData.items,
                  sandboxCapability: localData.sandbox,
                  sandboxEnabled,
                  onToggleSandbox: (next) => {
                    setSandboxEnabled(next);
                    writeSandboxPreference(next);
                  },
                  loading: localData.loading,
                  error: localData.error,
                  onRefresh: () => loadLocalProjects(),
                  onPrepare: prepareLocal,
                  onStop: async id => {
                    const payload = await tianaFetch(`/tiana/api/workspaces/stop?id=${encodeURIComponent(id)}`, { method: 'POST' });
                    if (payload.error) throw new Error(payload.error.message);
                    await loadLocalProjects(true);
                  },
                  onOpenSession,
                })
              : section === 'sites'
              ? h(SitesView, {
                  t,
                  sites,
                  tab: siteTab,
                  setTab: setSiteTab,
                  query: siteQuery,
                  setQuery: setSiteQuery,
                  onNotice: setNotice,
                  notice,
                  onCloseNotice: () => setNotice(null),
                  auth,
                  login,
                  onStartLogin: startLogin,
                  onOpenLogin: openLogin,
                  onCopyLogin: copyLogin,
                  onCancelLogin: cancelLogin,
                  onRetryStatus: checkStatus,
                  sitesLoading: sitesData.loading,
                  sitesError: sitesData.error,
                  onRetrySites: () => loadSites(siteRetryRef.current),
                  sharedUnavailable: true,
                  onDeleteSite: deleteSite,
                  onRefreshSites: () => loadSites(),
                  page: sitesData.page, total: sitesData.total, totalPages: sitesData.totalPages,
                  onPrevious: () => loadSites(sitesData.page - 1),
                  onNext: () => loadSites(sitesData.page + 1),
                })
              : h(TemplatesView, {
                  t,
                  templates: templatesData.items,
                  categories: templatesData.categories,
                  query: templateQuery,
                  setQuery: setTemplateQuery,
                  category: templateCategory,
                  setCategory: setTemplateCategory,
                  onNotice: setNotice,
                  notice,
                  onCloseNotice: () => setNotice(null),
                  auth,
                  authControls: { login, onStartLogin: startLogin, onOpenLogin: openLogin, onCopyLogin: copyLogin, onCancelLogin: cancelLogin, onRetryStatus: checkStatus },
                  templatesLoading: templatesData.loading,
                  templatesLoadingMore: templatesData.loadingMore,
                  templatesError: templatesData.error,
                  templatesMoreError: templatesData.moreError,
                  onRetryTemplates: retryTemplates,
                  onLoadMore: loadMoreTemplates,
                  onRetryMore: () => {
                    if (!templateLoadingMoreRef.current && templateRetryRef.current) void loadTemplatePage(templateRetryRef.current);
                  },
                  hasMore: templatesData.nextCursor !== null,
                  page: templatesData.page ?? 1,
                  onPrevious: () => {
                    if (templateLoadingMoreRef.current || templatesData.loading) return;
                    void loadTemplatePage({ query: templateQuery.trim(), category: templateCategory,
                      after: templateCursorsRef.current[(templatesData.page ?? 1) - 2] ?? '',
                      page: (templatesData.page ?? 1) - 1, reset: false });
                  },
                  installOrigin: templatesData.origin,
                  onOpenSession,
                }),
          ),
        ),
      );
    }

    const TIANA_SPIDER_PATHS = [
      "M3710 9439 c-41 -27 -82 -52 -90 -56 -55 -26 -602 -402 -633 -435 -46 -51 -64 -110 -72 -248 -3 -58 -10 -157 -15 -220 -15 -182 -31 -465 -31 -548 1 -43 -6 -165 -14 -272 -9 -107 -19 -245 -23 -306 -9 -117 -11 -123 -91 -231 -12 -16 -24 -39 -28 -53 -10 -32 -10 -446 -1 -483 12 -50 57 -115 111 -161 63 -54 498 -415 652 -541 61 -49 135 -112 166 -140 30 -27 113 -98 185 -156 195 -162 188 -153 181 -204 -4 -23 -13 -58 -21 -76 -22 -50 -29 -72 -31 -89 -1 -8 -21 -67 -45 -130 -56 -151 -100 -280 -105 -305 -3 -11 -19 -63 -36 -116 -29 -89 -30 -99 -20 -151 15 -69 42 -107 120 -165 72 -53 85 -34 -114 -163 -138 -89 -705 -465 -865 -573 -104 -71 -153 -128 -177 -205 -16 -53 -33 -582 -36 -1147 -2 -395 -6 -383 168 -585 374 -436 842 -940 871 -940 8 0 14 2 14 5 0 9 -133 229 -160 265 -15 19 -45 67 -67 105 -34 60 -146 240 -267 430 -18 28 -56 91 -86 140 -29 50 -86 139 -126 198 -103 153 -100 123 -80 717 9 272 19 539 22 593 9 143 23 161 222 291 86 57 180 120 207 139 59 41 544 360 661 435 45 29 91 52 103 52 20 0 52 -15 181 -89 68 -38 103 -39 153 -4 46 32 67 69 67 117 0 53 -16 79 -73 116 -29 19 -88 60 -132 92 -44 32 -125 90 -180 129 -115 81 -125 91 -125 136 0 32 65 229 135 413 20 52 54 145 75 205 21 61 57 160 80 220 46 124 77 208 78 215 2 16 83 239 117 325 21 52 37 99 40 115 3 18 49 147 55 155 4 6 37 96 73 200 116 338 163 449 206 488 80 72 201 95 308 57 91 -32 128 -75 174 -205 12 -33 37 -103 56 -155 19 -52 51 -147 73 -210 21 -63 51 -146 66 -185 15 -38 53 -144 84 -235 32 -91 70 -196 84 -235 14 -38 46 -126 70 -195 24 -69 67 -188 96 -265 29 -77 53 -147 55 -155 4 -17 84 -234 122 -330 14 -35 26 -69 27 -75 1 -5 5 -16 9 -22 5 -7 6 -13 3 -13 -3 0 1 -19 9 -41 38 -108 41 -105 -297 -344 -177 -126 -188 -137 -188 -200 0 -59 27 -103 81 -130 40 -21 68 -18 119 12 135 79 164 93 186 93 22 0 131 -66 356 -215 50 -33 97 -64 106 -70 9 -5 104 -68 211 -139 515 -339 493 -322 510 -409 12 -63 45 -1013 40 -1148 -4 -91 -6 -101 -48 -180 -24 -46 -76 -133 -115 -194 -40 -60 -105 -164 -146 -230 -40 -66 -97 -156 -126 -200 -28 -44 -79 -125 -112 -180 -33 -55 -78 -129 -100 -165 -63 -100 -132 -222 -132 -231 0 -26 34 0 110 83 47 51 121 131 165 178 44 47 116 126 160 175 44 49 123 137 175 195 52 58 129 146 170 195 40 50 102 122 137 161 123 139 118 109 119 724 0 294 -2 627 -5 740 -6 205 -6 205 -43 265 -54 88 -51 86 -348 282 -80 53 -189 125 -243 162 -54 36 -147 97 -205 135 -279 181 -368 240 -384 254 -16 14 -13 18 45 62 61 47 117 100 104 100 -3 0 1 16 9 35 19 47 18 95 -5 160 -11 30 -18 55 -16 55 2 0 -12 44 -31 98 -60 166 -115 326 -119 344 -2 9 -23 69 -46 133 -50 140 -50 140 52 222 40 32 147 120 238 195 382 317 654 540 773 636 229 185 228 184 225 507 -2 233 -2 233 -35 277 -90 119 -83 95 -103 345 -10 126 -18 273 -18 328 -1 55 -7 204 -16 330 -8 127 -19 307 -25 400 -27 434 4 378 -331 602 -437 293 -579 381 -579 358 0 -6 138 -151 322 -340 239 -246 260 -269 280 -312 20 -46 36 -190 37 -333 1 -80 21 -472 56 -1045 17 -288 19 -297 82 -388 47 -68 47 -68 56 -185 9 -104 8 -125 -8 -176 -19 -59 -27 -68 -162 -178 -29 -24 -115 -94 -190 -157 -132 -109 -211 -174 -545 -443 -81 -65 -172 -142 -203 -169 -37 -34 -56 -47 -60 -37 -2 7 -29 81 -60 164 -30 83 -55 156 -55 162 0 5 -32 95 -70 198 -39 104 -72 198 -75 209 -2 11 -4 21 -6 23 -1 1 -2 5 -3 10 -1 4 -9 27 -19 52 -83 222 -128 350 -133 374 -19 107 -158 271 -278 327 -255 119 -590 48 -739 -158 -59 -83 -100 -181 -251 -613 -36 -102 -79 -221 -96 -265 -17 -44 -33 -96 -36 -115 -3 -19 -10 -39 -14 -45 -4 -5 -29 -71 -55 -145 -65 -187 -64 -186 -95 -157 -14 13 -160 133 -325 267 -165 134 -333 271 -374 304 -41 34 -100 84 -130 112 -31 27 -100 85 -155 129 -134 107 -150 139 -145 304 4 117 4 117 56 197 29 43 57 93 64 109 6 17 17 143 25 280 7 138 20 356 28 485 29 449 38 631 33 644 -3 8 -4 16 -1 19 3 2 6 42 8 88 6 143 16 161 189 339 181 185 437 457 437 464 0 15 -30 1 -100 -45z",
      "M1892 8058 c-71 -112 -146 -232 -165 -268 -71 -132 -68 -93 -65 -1090 3 -895 3 -895 28 -930 63 -90 99 -101 357 -109 l213 -7 152 -77 c84 -42 187 -92 228 -112 41 -20 109 -53 150 -74 41 -21 174 -87 295 -146 121 -58 227 -111 235 -116 28 -18 165 -81 190 -88 45 -13 47 -48 10 -161 l-33 -102 -141 8 c-286 18 -317 15 -433 -39 -56 -26 -142 -69 -190 -96 -48 -26 -254 -134 -458 -239 -577 -299 -545 -281 -577 -342 -28 -52 -28 -52 -28 -814 0 -761 0 -761 24 -828 30 -85 107 -213 245 -408 119 -168 144 -201 154 -191 8 8 -30 130 -102 323 -22 59 -42 122 -45 140 -3 19 -13 51 -23 73 -16 37 -18 74 -16 430 3 592 19 1086 37 1128 19 45 20 46 646 365 524 266 473 245 590 244 58 -1 167 -6 242 -13 182 -14 232 3 243 83 2 20 50 162 123 368 25 70 23 64 24 127 1 86 2 85 -397 283 -730 362 -1024 503 -1075 515 -30 7 -119 16 -196 19 -78 3 -153 10 -168 16 -57 21 -54 -25 -76 1171 -11 559 -8 625 29 744 11 33 33 107 51 165 17 58 37 116 44 130 7 14 16 39 20 55 4 17 9 38 12 48 3 11 0 17 -9 17 -8 0 -73 -91 -145 -202z",
      "M8168 8255 c-3 -3 25 -98 63 -211 38 -113 68 -209 67 -213 0 -3 1 -8 2 -11 1 -3 3 -14 5 -25 1 -11 7 -50 13 -87 7 -44 7 -187 2 -425 -5 -197 -12 -569 -15 -828 -3 -258 -8 -478 -11 -488 -11 -35 -59 -48 -202 -53 -179 -7 -202 -12 -367 -93 -77 -38 -293 -144 -480 -235 -187 -91 -347 -171 -355 -176 -8 -6 -31 -17 -50 -26 -199 -93 -383 -190 -396 -210 -41 -62 -34 -103 73 -433 83 -254 63 -239 298 -221 322 25 326 25 512 -67 90 -44 169 -85 176 -92 13 -10 128 -70 465 -241 165 -83 289 -158 311 -186 17 -21 19 -70 27 -586 11 -676 11 -845 2 -918 -4 -30 -7 -55 -8 -55 -1 0 -3 -7 -5 -15 -6 -26 -61 -191 -104 -310 -41 -114 -46 -131 -56 -200 -6 -35 -6 -35 12 -12 10 13 35 44 55 70 55 69 237 345 285 432 28 50 45 97 52 140 15 88 15 1511 1 1562 -18 62 -54 93 -198 169 -75 39 -177 94 -227 120 -49 27 -182 97 -295 155 -113 59 -218 115 -235 125 -29 18 -269 139 -331 167 -47 22 -135 26 -302 13 -86 -7 -167 -14 -179 -17 -25 -5 -36 14 -79 141 -22 67 -23 71 -6 93 9 13 33 29 52 36 19 7 96 44 170 83 74 39 140 71 145 72 6 0 145 68 310 150 165 82 338 168 385 191 47 23 117 58 155 77 70 37 70 37 279 44 240 8 275 19 331 98 30 43 30 43 33 929 3 906 0 980 -36 1051 -59 116 -87 164 -199 334 -117 176 -132 195 -145 182z",
    ];

    function TianaIcon({ size = 20 }) {
      const renderedSize = Math.max(size, 20);
      return h(
        'svg',
        {
          width: renderedSize,
          height: renderedSize,
          viewBox: '0 0 1024 1024',
          fill: 'currentColor',
          role: 'img',
          'aria-label': 'Tiana',
          style: { display: 'block' },
        },
        h(
          'g',
          { transform: 'translate(0,1024) scale(0.1,-0.1)' },
          TIANA_SPIDER_PATHS.map((d, index) => h('path', { key: index, d })),
        ),
      );
    }

    const CSS_TEXT = `
      .tiana-root, .tiana-root * { box-sizing: border-box; }
      .tiana-root {
        display: flex;
        height: 100%;
        min-height: 0;
        background: var(--dsw-alias-bg-base);
        color: var(--dsw-alias-label-primary);
        font-family: inherit;
      }
      .tiana-nav {
        width: 196px;
        flex: 0 0 196px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 18px 12px;
        border-right: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-layer-1);
        min-height: 0;
      }
      .tiana-brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 18px; }
      .tiana-brand-mark {
        width: 30px; height: 30px; border-radius: 9px;
        background: linear-gradient(135deg, #8ef2d4 0%, #46c7a5 100%);
        color: #0b1f2c; display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 16px;
      }
      .tiana-brand-name { font-size: 14px; line-height: 18px; font-weight: 600; }
      .tiana-brand-sub { font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-secondary); }
      .tiana-nav-items { display: flex; flex-direction: column; gap: 4px; }
      .tiana-nav-grow { flex: 1 1 auto; min-height: 12px; }
      .tiana-nav-bottom { display: flex; flex-direction: column; gap: 4px; }
      .tiana-nav-item {
        display: flex; align-items: center; gap: 10px; width: 100%;
        border: 0; background: transparent; color: var(--dsw-alias-label-secondary);
        font: inherit; font-size: 13px; line-height: 18px; padding: 9px 10px;
        border-radius: 8px; cursor: pointer; text-align: left;
      }
      .tiana-nav-item:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
      .tiana-nav-item.is-active { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-weight: 600; }
      .tiana-nav-item.is-active svg { color: var(--dsw-alias-brand-primary); }
      .tiana-nav-footer { padding: 2px 8px 0; font-size: 10px; color: var(--dsw-alias-label-tertiary); }
      .tiana-content { flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
      .tiana-content-scroll { height: 100%; overflow-y: auto; padding: 34px 36px 48px; }
      .tiana-page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 26px; }
      .tiana-heading { min-width: 0; }
      .tiana-heading h1 { margin: 0; font-size: 30px; line-height: 38px; letter-spacing: -0.02em; font-weight: 600; }
      .tiana-subtitle { margin: 8px 0 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
      .tiana-public-note { margin: 5px 0 0; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .tiana-head-actions { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; padding-top: 3px; }
      .tiana-search {
        display: flex; align-items: center; gap: 8px; height: 36px; min-width: 220px;
        padding: 0 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
        background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary);
      }
      .tiana-search:focus-within { border-color: var(--dsw-alias-brand-primary); }
      .tiana-search input {
        border: 0; outline: 0; background: transparent; color: var(--dsw-alias-label-primary);
        font: inherit; font-size: 13px; width: 100%; padding: 0; min-width: 0;
      }
      .tiana-search input::placeholder { color: var(--dsw-alias-label-secondary); }
      .tiana-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid transparent;
        font: inherit; font-size: 13px; line-height: 18px; cursor: pointer; white-space: nowrap;
      }
      .tiana-btn:focus-visible, .tiana-nav-item:focus-visible, .tiana-tab:focus-visible,
      .tiana-view-btn:focus-visible, .tiana-chip:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px;
      }
      .tiana-btn-primary { background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base); }
      .tiana-btn-primary:hover { opacity: 0.88; }
      .tiana-btn-ghost { border-color: var(--dsw-alias-border-l1); background: transparent; color: var(--dsw-alias-label-primary); }
      .tiana-btn-ghost:hover { background: var(--dsw-alias-bg-layer-2); }
      .tiana-btn-small { height: 30px; padding: 0 10px; font-size: 12px; }
      .tiana-tab-row {
        display: flex; align-items: center; justify-content: space-between; gap: 16px;
        border-bottom: 1px solid var(--dsw-alias-border-l1);
      }
      .tiana-tabs { display: flex; align-items: center; gap: 6px; }
      .tiana-tab {
        border: 1px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary);
        font: inherit; font-size: 13px; line-height: 18px; padding: 7px 13px; border-radius: 999px; cursor: pointer;
      }
      .tiana-tab:hover { color: var(--dsw-alias-label-primary); }
      .tiana-tab.is-active { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
      .tiana-view-toggle { display: flex; gap: 2px; padding-bottom: 8px; }
      .tiana-view-btn {
        width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center;
        border: 1px solid transparent; border-radius: 7px; background: transparent;
        color: var(--dsw-alias-label-secondary); cursor: pointer;
      }
      .tiana-view-btn:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
      .tiana-view-btn.is-active { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
      .tiana-table { margin-top: 10px; }
      .tiana-table-head {
        display: grid; grid-template-columns: minmax(0, 1fr) 180px 104px; gap: 16px;
        padding: 10px 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px;
        border-bottom: 1px solid var(--dsw-alias-border-l1);
      }
      .tiana-site-row {
        display: grid; grid-template-columns: minmax(0, 1fr) 180px 104px; gap: 16px;
        align-items: center; padding: 14px 8px;
        border-bottom: 1px solid var(--dsw-alias-border-l1);
      }
      .tiana-site-row:hover { background: var(--dsw-alias-bg-layer-1); }
      .tiana-site-main { display: flex; align-items: center; gap: 16px; min-width: 0; }
      .tiana-site-open {
        display: flex; align-items: center; gap: 16px; min-width: 0;
        color: inherit; text-decoration: none;
      }
      .tiana-site-open:hover .tiana-site-title { text-decoration: underline; text-underline-offset: 3px; }
      .tiana-site-actions {
        display: flex; align-items: center; justify-content: flex-end; gap: 4px;
      }
      .tiana-icon-btn {
        width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px;
        background: transparent; color: var(--dsw-alias-label-secondary);
        cursor: pointer; text-decoration: none; flex: none;
      }
      .tiana-icon-btn:hover:not(:disabled) {
        color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2);
        background: var(--dsw-alias-bg-layer-2);
      }
      .tiana-icon-btn.is-danger:hover:not(:disabled) {
        color: var(--dsw-alias-state-error-primary);
        border-color: var(--dsw-alias-state-error-primary);
      }
      .tiana-icon-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .tiana-thumb {
        position: relative; width: 56px; height: 56px; flex: 0 0 56px;
        border-radius: 9px; overflow: hidden;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
        background: var(--dsw-alias-bg-layer-2);
      }
      .tiana-site-image { width: 100%; height: 100%; display: block; object-fit: cover; }
      .tiana-site-initial {
        display: flex; width: 100%; height: 100%; align-items: center; justify-content: center;
        color: rgba(255, 255, 255, 0.9); font-size: 20px; font-weight: 600;
      }
      .tiana-thumb-large { width: 100%; height: 104px; flex: none; border-radius: 10px; }
      .tiana-thumb-large .tiana-site-initial { font-size: 32px; }
      .tiana-site-info { min-width: 0; }
      .tiana-site-title {
        font-size: 14px; line-height: 20px; font-weight: 500;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .tiana-site-date { margin-top: 3px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .tiana-site-share { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
      .tiana-pagination { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 18px; font-size: 12px; }
      .tiana-pagination button { min-height: 32px; }
      .tiana-pagination button:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
      .tiana-list-footer { margin: 18px 0 0; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .tiana-footnote { opacity: 0.8; }
      .tiana-site-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; margin-top: 18px; }
      .tiana-site-card {
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 11px;
        background: var(--dsw-alias-bg-layer-1); padding: 10px;
        transition: border-color 0.15s ease, transform 0.15s ease;
      }
      .tiana-site-card:hover { border-color: var(--dsw-alias-border-l2); transform: translateY(-1px); }
      .tiana-site-card-open { display: block; color: inherit; text-decoration: none; }
      .tiana-site-card-open:hover .tiana-site-card-title { text-decoration: underline; text-underline-offset: 3px; }
      .tiana-site-card-actions {
        display: flex; justify-content: flex-end; gap: 4px;
        margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l1);
      }
      .tiana-site-card-meta { display: flex; justify-content: space-between; gap: 10px; padding: 10px 2px 4px; align-items: flex-start; }
      .tiana-site-card-title { font-size: 13px; line-height: 18px; font-weight: 500; }
      .tiana-site-card-date { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .tiana-site-card-share { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .tiana-local-list { display: flex; flex-direction: column; margin-top: 14px; }
      .tiana-local-row {
        display: grid; grid-template-columns: 112px minmax(0, 1fr) auto;
        gap: 16px; align-items: center; padding: 14px 8px;
        border-bottom: 1px solid var(--dsw-alias-border-l1);
      }
      .tiana-local-row:hover { background: var(--dsw-alias-bg-layer-1); }
      .tiana-local-thumb {
        width: 112px; height: 76px; border-radius: 9px; overflow: hidden;
        background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, var(--dsw-alias-bg-layer-2));
        display: flex; align-items: center; justify-content: center;
      }
      .tiana-local-thumb img { width: 100%; height: 100%; display: block; object-fit: cover; }
      .tiana-local-thumb-fallback { font-size: 24px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
      .tiana-local-main { min-width: 0; }
      .tiana-local-row .tiana-local-card-head { justify-content: flex-start; gap: 8px; }
      .tiana-local-actions {
        display: flex; flex-wrap: nowrap; align-items: center; justify-content: flex-end;
        gap: 8px; max-width: none; margin-top: 0; padding-top: 0;
      }
      .tiana-local-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 12px; margin-top: 14px;
      }
      .tiana-local-card {
        display: flex; flex-direction: column; gap: 9px;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px;
        background: var(--dsw-alias-bg-layer-1); padding: 14px;
      }
      .tiana-local-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
      .tiana-local-title { font-size: 14px; line-height: 20px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .tiana-local-status {
        flex: none; padding: 2px 7px; border-radius: 999px;
        font-size: 10px; line-height: 16px; font-weight: 500;
        border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary);
      }
      .tiana-local-status-ready { color: var(--dsw-alias-state-success-primary, #3f9d67); border-color: color-mix(in srgb, currentColor 35%, transparent); }
      .tiana-local-status-preparing { color: var(--dsw-alias-state-business-primary, #6f7cff); }
      .tiana-local-status-failed { color: var(--dsw-alias-state-error-primary, #d05b5b); }
      .tiana-local-path {
        font-family: var(--dsw-font-mono, ui-monospace, monospace);
        font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary);
        overflow-wrap: anywhere;
      }
      .tiana-local-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .tiana-sandbox-switch {
        display: inline-flex; align-items: center; gap: 8px;
        font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary);
        cursor: pointer; user-select: none;
      }
      .tiana-sandbox-switch.is-disabled {
        opacity: 0.55; cursor: not-allowed;
      }
      .tiana-sandbox-switch-input {
        position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
      }
      .tiana-sandbox-switch-track {
        position: relative; display: inline-flex; align-items: center;
        width: 32px; height: 18px; padding: 2px; border-radius: 999px;
        background: var(--dsw-alias-bg-layer-3, rgba(127, 127, 127, 0.28));
        border: 1px solid var(--dsw-alias-border-l1);
        transition: background 0.16s ease, border-color 0.16s ease;
      }
      .tiana-sandbox-switch-thumb {
        width: 12px; height: 12px; border-radius: 50%;
        background: var(--dsw-alias-label-secondary, #888);
        transition: transform 0.16s ease, background 0.16s ease;
      }
      .tiana-sandbox-switch-input:checked + .tiana-sandbox-switch-track {
        background: color-mix(in srgb, var(--dsw-alias-brand-primary, #46c7a5) 28%, transparent);
        border-color: var(--dsw-alias-brand-primary, #46c7a5);
      }
      .tiana-sandbox-switch-input:checked + .tiana-sandbox-switch-track .tiana-sandbox-switch-thumb {
        transform: translateX(14px);
        background: var(--dsw-alias-brand-primary, #46c7a5);
      }
      .tiana-sandbox-switch-input:focus-visible + .tiana-sandbox-switch-track {
        outline: 2px solid var(--dsw-alias-brand-primary, #46c7a5);
        outline-offset: 2px;
      }
      .tiana-sandbox-switch-label { font-weight: 500; }
      .tiana-sandbox-switch-note {
        font-size: 11px; color: var(--dsw-alias-state-warn-primary, #d99b26);
      }
      .tiana-local-sandbox-ok { color: var(--dsw-alias-state-success-primary, #3f9d67); font-weight: 500; }
      .tiana-local-sandbox-warn { color: var(--dsw-alias-state-warn-primary, #d99b26); font-weight: 500; }
      .tiana-local-warn {
        margin: 0; max-height: 52px; overflow: hidden;
        font-size: 11px; line-height: 16px; color: var(--dsw-alias-state-warn-primary, #d99b26);
        overflow-wrap: anywhere;
      }
      .tiana-local-error {
        margin: 0; max-height: 52px; overflow: hidden;
        font-size: 11px; line-height: 16px; color: var(--dsw-alias-state-error-primary, #d05b5b);
        overflow-wrap: anywhere;
      }
      .tiana-local-actions > .tiana-btn { min-height: 32px; white-space: nowrap; }
      .tiana-preview-tools { display: inline-flex; align-items: center; gap: 2px; padding-left: 7px; border-left: 1px solid var(--dsw-alias-border-l1); }
      .tiana-preview-tools .tiana-icon-btn { min-width: 32px; min-height: 32px; border-color: transparent; }
      .tiana-preview-tools .tiana-icon-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      @media (hover: hover) { .tiana-stop-preview:hover { color: var(--dsw-alias-state-error-primary, #c44343); background: color-mix(in srgb, currentColor 8%, transparent); } }
      @media (pointer: coarse) { .tiana-preview-tools .tiana-icon-btn { min-width: 40px; min-height: 40px; } }
      .tiana-field-hint { display: block; margin-top: 4px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
      .tiana-duplicate {
        display: flex; flex-direction: column; gap: 8px;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px;
        background: var(--dsw-alias-bg-layer-1); padding: 12px;
      }
      .tiana-duplicate-title { font-size: 13px; line-height: 18px; font-weight: 600; }
      .tiana-duplicate-body { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
      .tiana-duplicate-row {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 7px 0; border-top: 1px solid var(--dsw-alias-border-l1);
      }
      .tiana-duplicate-info { min-width: 0; }
      .tiana-duplicate-name { font-size: 12px; line-height: 17px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .tiana-duplicate-info code {
        display: block; max-width: 440px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        font-size: 10px; line-height: 15px; color: var(--dsw-alias-label-tertiary);
      }
      .tiana-duplicate > button { align-self: flex-start; }
      .tiana-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 20px; }
      .tiana-chip {
        height: 28px; padding: 0 12px; border-radius: 999px;
        border: 1px solid var(--dsw-alias-border-l1); background: transparent;
        color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer;
      }
      .tiana-chip:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }
      .tiana-chip.is-active { background: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base); }
      .tiana-template-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
      .tiana-template-card {
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; overflow: hidden;
        background: var(--dsw-alias-bg-layer-1); display: flex; flex-direction: column;
        transition: border-color 0.15s ease, transform 0.15s ease;
      }
      .tiana-template-card:hover { border-color: var(--dsw-alias-border-l2); transform: translateY(-1px); }
      .tiana-template-cover {
        position: relative; display: block; width: 100%; aspect-ratio: 16 / 10;
        overflow: hidden; padding: 0; border: 0; font: inherit; color: inherit;
        text-align: left; cursor: pointer; background: var(--dsw-alias-bg-layer-2);
      }
      .tiana-template-cover:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
      .tiana-template-cover-img {
        width: 100%; height: 100%; object-fit: cover; display: block;
        transition: transform 0.3s ease;
      }
      .tiana-template-card:hover .tiana-template-cover-img { transform: scale(1.025); }
      .tiana-template-cover-fallback {
        position: absolute; inset: 0; padding: 14px; display: flex; align-items: flex-end;
      }
      .tiana-template-cover-fallback::after {
        content: ""; position: absolute; inset: 0;
        background-image: radial-gradient(rgba(255, 255, 255, 0.18) 1px, transparent 1px);
        background-size: 14px 14px; opacity: 0.5; pointer-events: none;
      }
      .tiana-template-mark {
        position: relative; z-index: 1; width: 46px; height: 46px; border-radius: 12px;
        background: rgba(255, 255, 255, 0.18); color: #fff; display: flex;
        align-items: center; justify-content: center; font-size: 20px; font-weight: 600;
        backdrop-filter: blur(2px);
      }
      .tiana-template-cover-badge {
        position: absolute; top: 12px; right: 12px; z-index: 1;
        padding: 3px 8px; border-radius: 999px; background: rgba(0, 0, 0, 0.22);
        color: #fff; font-size: 10px; line-height: 16px;
      }
      .tiana-template-body { padding: 14px; display: flex; flex-direction: column; gap: 9px; flex: 1; }
      .tiana-template-title {
        margin: 0; font-size: 14px; line-height: 20px; font-weight: 600;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .tiana-template-desc {
        margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary);
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        overflow: hidden; min-height: 36px;
      }
      .tiana-template-author {
        display: flex; align-items: center; gap: 5px; min-width: 0;
        font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary);
      }
      .tiana-template-author-name {
        min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        color: var(--dsw-alias-label-primary);
      }
      .tiana-template-official {
        flex: none; width: 15px; height: 15px; display: inline-flex;
        align-items: center; justify-content: center; border-radius: 50%;
        border: 1px solid var(--dsw-alias-border-l1);
        color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 1;
      }
      .tiana-template-tags { display: flex; flex-wrap: wrap; gap: 4px; }
      .tiana-template-tag {
        padding: 1px 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 15px;
      }
      .tiana-template-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; padding-top: 2px; }
      .tiana-template-installs {
        min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary);
      }
      .tiana-template-actions { display: flex; gap: 6px; flex: none; }
      .tiana-scroll-sentinel { height: 1px; margin-top: 8px; }
      .tiana-load-more {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        padding: 18px 0 4px; font-size: 12px; color: var(--dsw-alias-label-secondary);
      }
      .tiana-load-more-error {
        display: flex; align-items: center; justify-content: center; gap: 10px;
        padding: 14px 0 4px; font-size: 12px; color: var(--dsw-alias-state-error-primary);
      }
      .tiana-list-end {
        margin: 18px 0 0; text-align: center; font-size: 11px;
        color: var(--dsw-alias-label-secondary);
      }
      .tiana-dialog-backdrop {
        position: fixed; inset: 0; z-index: 1000; padding: 24px;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0, 0, 0, 0.42);
      }
      .tiana-dialog {
        position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 340px;
        width: min(1120px, 100%); height: min(760px, calc(100vh - 48px));
        overflow: hidden; border-radius: 14px;
        border: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-layer-1);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
      }
      .tiana-dialog-preview {
        min-width: 0; min-height: 0; background: #fff;
        border-right: 1px solid var(--dsw-alias-border-l1);
      }
      .tiana-preview-frame { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
      .tiana-dialog-info {
        min-width: 0; min-height: 0; overflow: auto; padding: 24px;
        display: flex; flex-direction: column; gap: 12px;
      }
      .tiana-dialog-kicker {
        font-size: 10px; line-height: 15px; letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--dsw-alias-label-secondary);
      }
      .tiana-dialog-title { margin: 0; font-size: 19px; line-height: 27px; font-weight: 600; }
      .tiana-dialog-desc {
        margin: 0; white-space: pre-wrap; font-size: 12px; line-height: 19px;
        color: var(--dsw-alias-label-secondary);
      }
      .tiana-dialog-counts {
        display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; line-height: 16px;
        color: var(--dsw-alias-label-secondary);
      }
      .tiana-dialog-actions { margin-top: auto; display: flex; flex-wrap: wrap; gap: 8px; padding-top: 16px; }
      .tiana-prompt {
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
        padding: 8px 10px; font-size: 12px; line-height: 18px;
      }
      .tiana-prompt summary { cursor: pointer; color: var(--dsw-alias-label-secondary); }
      .tiana-prompt-text {
        width: 100%; min-height: 140px; margin-top: 8px; resize: vertical;
        padding: 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
        background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
        font: 11px/17px ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .tiana-dialog-close {
        position: absolute; top: 12px; right: 12px; z-index: 3;
        width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
        background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary);
        cursor: pointer;
      }
      .tiana-dialog-close:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
      .tiana-fork-dialog {
        display: flex; flex-direction: column; width: min(620px, 100%);
        height: auto; max-height: calc(100vh - 48px);
      }
      .tiana-fork-body {
        display: flex; flex-direction: column; gap: 10px;
        padding: 18px; overflow: auto;
      }
      .tiana-fork-body > .tiana-auth-card { margin: 0; padding: 8px 0; max-width: none; gap: 6px; border: 0; border-radius: 0; }
      .tiana-fork-body > .tiana-auth-card .tiana-auth-icon { display: none; }
      .tiana-install-options { display: flex; align-items: stretch; gap: 10px; }
      .tiana-install-options > .tiana-install-option { flex: 1 1 0; min-inline-size: 0; overflow-wrap: anywhere; }
      .tiana-install-option {
        display: flex; flex-direction: column; gap: 10px; padding: 12px;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px;
        background: var(--dsw-alias-bg-layer-1);
      }
      .tiana-install-option-head > div:last-child { min-inline-size: 0; }
      .tiana-install-option-head .tiana-auth-icon { flex-shrink: 0; width: 32px; height: 32px; border-radius: 8px; }
      .tiana-install-option-head { display: flex; align-items: flex-start; gap: 8px; }
      .tiana-install-option-head h3 { margin: 0; font-size: 14px; line-height: 20px; font-weight: 600; }
      .tiana-install-option-head .tiana-auth-body { margin-top: 4px; max-width: none; text-align: left; }
      .tiana-install-option-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto; }
      .tiana-install-option > .tiana-btn { margin-top: auto; }
      .tiana-install-option-actions > .tiana-btn { flex: 1; justify-content: center; }
      .tiana-install-field {
        display: flex; flex-direction: column; gap: 5px;
        font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary);
      }
      .tiana-install-field input {
        height: 34px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 7px; background: var(--dsw-alias-bg-base);
        color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px;
      }
      .tiana-install-field input:focus { outline: 0; border-color: var(--dsw-alias-brand-primary); }
      .tiana-install-result {
        display: flex; flex-direction: column; gap: 5px; padding: 10px;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
        background: var(--dsw-alias-bg-layer-2); font-size: 11px; line-height: 17px;
        color: var(--dsw-alias-label-secondary);
      }
      .tiana-install-result code {
        word-break: break-all; font: 11px/17px ui-monospace, SFMono-Regular, Menlo, monospace;
        color: var(--dsw-alias-label-primary);
      }
      .tiana-fork-body .tiana-auth-warn { max-width: none; }
      .tiana-fork-body .tiana-auth-error {
        max-width: none; max-height: 180px; overflow: auto; white-space: pre-wrap;
      }
      .tiana-dialog-message {
        display: flex; align-items: center; justify-content: center;
        width: min(620px, 100%); height: auto; min-height: 280px; padding: 40px;
      }
      .tiana-dialog-message-body {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 10px; text-align: center; color: var(--dsw-alias-label-secondary);
      }
      @media (max-width: 900px) {
        .tiana-dialog-backdrop { padding: 12px; }
        .tiana-dialog {
          grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto;
          height: calc(100vh - 24px);
        }
        .tiana-dialog-preview { border-right: 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
        .tiana-dialog-info { max-height: 48vh; padding: 18px; }
        .tiana-fork-dialog { width: min(620px, 100%); height: auto; max-height: calc(100dvh - 24px); }
        .tiana-install-option { padding: 12px; }
        .tiana-fork-body { padding: 18px; }
      }
      @media (max-width: 540px) {
        .tiana-install-option-head { flex-direction: column; }
        .tiana-fork-body { padding: 14px; }
      }
      .tiana-empty {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-align: center; padding: 56px 20px; border: 1px dashed var(--dsw-alias-border-l1);
        border-radius: 12px; margin-top: 18px; color: var(--dsw-alias-label-secondary);
      }
      .tiana-empty-icon {
        width: 40px; height: 40px; border-radius: 50%; display: flex;
        align-items: center; justify-content: center; background: var(--dsw-alias-bg-layer-1);
        margin-bottom: 10px;
      }
      .tiana-empty-title { font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-primary); }
      .tiana-empty-hint { margin-top: 4px; font-size: 12px; }
      .tiana-notice {
        display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
        margin: 18px 0 0; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 9px; background: var(--dsw-alias-bg-layer-1);
        color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px;
      }
      .tiana-notice button {
        border: 0; background: transparent; color: var(--dsw-alias-label-secondary);
        cursor: pointer; padding: 2px; display: inline-flex;
      }
      .tiana-notice button:hover { color: var(--dsw-alias-label-primary); }
      .tiana-visually-hidden {
        position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
      }
      .tiana-account {
        display: flex; flex-direction: column; gap: 6px; padding: 10px 8px 8px;
        border-top: 1px solid var(--dsw-alias-border-l1);
        font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary);
      }
      .tiana-account-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .tiana-account-action { margin-left: auto; }
      .tiana-account-login {
        display: inline-flex; align-items: center; justify-content: center;
        width: 100%; height: 28px; padding: 0 10px; border-radius: 7px;
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px;
        font-weight: 600; cursor: pointer; white-space: nowrap;
      }
      .tiana-account-login:hover { background: var(--dsw-alias-bg-layer-2); }
      .tiana-account-login:disabled { opacity: 0.6; cursor: default; }
      .tiana-account-settings {
        display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
        padding: 2px 0; color: var(--dsw-alias-label-secondary);
        font-size: 11px; text-decoration: none;
      }
      .tiana-account-settings:hover { color: var(--dsw-alias-label-primary); }
      .tiana-space-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
      .tiana-space-label { flex: none; font-size: 10px; color: var(--dsw-alias-label-tertiary); }
      .tiana-space-static { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .tiana-space-picker { position: relative; flex: 1; min-width: 0; }
      .tiana-space-trigger {
        width: 100%; height: 28px; padding: 0 7px;
        display: flex; align-items: center; gap: 6px;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px;
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary); font: inherit; font-size: 11px;
        cursor: pointer; text-align: left;
      }
      .tiana-space-trigger:hover { background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2)); }
      .tiana-space-trigger:disabled { opacity: 0.65; cursor: default; }
      .tiana-space-trigger-name {
        flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .tiana-space-menu {
        position: absolute; left: 0; right: 0; bottom: calc(100% + 6px); z-index: 30;
        padding: 5px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px;
        background: var(--dsw-alias-bg-layer-1);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.28);
      }
      .tiana-space-option {
        display: flex; align-items: center; gap: 6px; width: 100%;
        padding: 7px 8px; border: 0; border-radius: 7px; background: transparent;
        color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px;
        text-align: left; cursor: pointer;
      }
      .tiana-space-option:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
      .tiana-space-option.is-current { color: var(--dsw-alias-label-primary); font-weight: 600; }
      .tiana-space-option-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .tiana-space-option-meta { color: var(--dsw-alias-label-tertiary); font-size: 9px; }
      .tiana-space-status { flex: none; font-size: 10px; color: var(--dsw-alias-label-tertiary); }
      .tiana-space-error { font-size: 10px; line-height: 14px; color: var(--dsw-alias-state-error-primary, #d05b5b); }
      .tiana-account-dot {
        width: 6px; height: 6px; border-radius: 50%; flex: none;
        background: var(--dsw-alias-state-idle-primary);
      }
      .tiana-account-dot.is-on { background: var(--dsw-alias-state-success-primary); }
      .tiana-account-label {
        flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .tiana-account-action {
        border: 0; background: transparent; color: var(--dsw-alias-label-secondary);
        font: inherit; font-size: 11px; cursor: pointer; padding: 2px;
      }
      .tiana-account-action:hover { color: var(--dsw-alias-label-primary); }
      .tiana-auth-card {
        position: relative;
        max-width: 560px; margin: 20px auto 0; padding: 30px;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px;
        background: var(--dsw-alias-bg-layer-1); text-align: center;
        display: flex; flex-direction: column; align-items: center; gap: 12px;
      }
      .tiana-auth-close {
        position: absolute; top: 10px; right: 10px; width: 26px; height: 26px;
        display: inline-flex; align-items: center; justify-content: center;
        border: 0; border-radius: 6px; background: transparent;
        color: var(--dsw-alias-label-secondary); cursor: pointer;
      }
      .tiana-auth-close:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
      .tiana-login-prompt { margin: 0 0 18px; }
      .tiana-login-prompt .tiana-auth-card { margin-top: 0; }
      .tiana-auth-icon {
        width: 46px; height: 46px; border-radius: 13px; display: flex;
        align-items: center; justify-content: center;
        background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-brand-primary);
      }
      .tiana-auth-title { margin: 2px 0 0; font-size: 18px; line-height: 26px; font-weight: 600; }
      .tiana-auth-body {
        margin: 0; max-width: 440px; font-size: 13px; line-height: 20px;
        color: var(--dsw-alias-label-secondary);
      }
      .tiana-auth-note { margin: 0; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .tiana-auth-link {
        width: 100%; max-width: 460px; padding: 10px 12px;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px;
        background: var(--dsw-alias-bg-base); text-align: left;
      }
      .tiana-auth-link code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px; line-height: 17px; color: var(--dsw-alias-label-secondary);
        word-break: break-all;
      }
      .tiana-auth-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
      .tiana-auth-waiting {
        display: flex; align-items: center; gap: 8px;
        font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary);
      }
      .tiana-auth-error {
        width: 100%; max-width: 460px; padding: 8px 10px;
        border: 1px solid var(--dsw-alias-state-error-primary); border-radius: 8px;
        color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 18px;
        text-align: left;
      }
      .tiana-auth-warn {
        width: 100%; max-width: 460px; padding: 8px 10px;
        border: 1px solid var(--dsw-alias-state-warn-primary); border-radius: 8px;
        color: var(--dsw-alias-state-warn-primary); font-size: 12px; line-height: 18px;
        text-align: left;
      }
      .tiana-auth-link code { cursor: text; user-select: all; }
      .tiana-state {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 10px; padding: 54px 20px; text-align: center;
        color: var(--dsw-alias-label-secondary);
      }
      .tiana-state-title { font-size: 13px; line-height: 20px; font-weight: 500; color: var(--dsw-alias-label-primary); }
      .tiana-state-body { font-size: 12px; line-height: 18px; max-width: 420px; }
      .tiana-spinner {
        width: 14px; height: 14px; border-radius: 50%; flex: none;
        border: 2px solid var(--dsw-alias-border-l1);
        border-top-color: var(--dsw-alias-brand-primary);
        animation: tiana-spin 0.8s linear infinite;
      }
      .tiana-search.is-disabled { opacity: 0.55; }
      .tiana-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      @keyframes tiana-spin { to { transform: rotate(360deg); } }
      @media (max-width: 760px) {
        .tiana-root { flex-direction: column; }
        .tiana-nav {
          width: auto; flex: 0 0 auto; flex-direction: row; align-items: center;
          padding: 8px 12px; border-right: 0; border-bottom: 1px solid var(--dsw-alias-border-l1);
        }
        .tiana-brand { padding: 0 8px 0 0; }
        .tiana-brand-mark { width: 26px; height: 26px; font-size: 14px; }
        .tiana-brand-sub { display: none; }
        .tiana-nav-items { flex-direction: row; }
        .tiana-nav-item { width: auto; }
        .tiana-nav-footer { display: none; }
        .tiana-account { display: none; }
        .tiana-nav:has(.has-spaces) { flex-wrap: wrap; }
        .tiana-nav-bottom:has(.has-spaces) { flex-basis: 100%; }
        .tiana-account.has-spaces { display: block; padding-top: 8px; }
        .tiana-account.has-spaces .tiana-space-menu { bottom: auto; top: calc(100% + 6px); max-height: 40dvh; overflow: auto; }
        .tiana-content-scroll { padding: 22px 18px 36px; }
        .tiana-page-head { flex-direction: column; gap: 16px; }
        .tiana-head-actions { width: 100%; }
        .tiana-search { flex: 1; min-width: 0; }
        .tiana-table-head { display: none; }
        .tiana-local-row { grid-template-columns: 72px minmax(0, 1fr); gap: 10px; align-items: start; }
        .tiana-local-thumb { width: 72px; height: 56px; }
        .tiana-local-actions { grid-column: 1 / -1; justify-content: flex-start; max-width: none; padding-left: 0; }
        .tiana-site-row { grid-template-columns: minmax(0, 1fr); gap: 8px; }
        .tiana-site-share,
        .tiana-site-actions { padding-left: 92px; }
        .tiana-site-actions { justify-content: flex-start; }
      }
    `;

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'tiana:locale');
        getActiveLocale = () => {
          try {
            const active = ctx.locale?.getLocale?.()?.active;
            if (typeof active === 'string' && active.length > 0) return active;
          } catch {
            // Fall back to navigator.language.
          }
          return typeof navigator !== 'undefined' && typeof navigator.language === 'string' ? navigator.language : 'en';
        };
        const t = ctx.locale.bind(NS);

        const openSession = (sessionId) => {
          try {
            const uiWorkspace = ctx.get('uiWorkspace');
            if (uiWorkspace === undefined || typeof uiWorkspace.openSession !== 'function') return false;
            uiWorkspace.openSession(sessionId);
            return true;
          } catch {
            return false;
          }
        };

        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
              locale: NS,
            },
            (props) => h(TianaPanel, { ...props, onOpenSession: openSession }),
          ),
        );

        ctx.slots.inject('conversation.input.overlay', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.overlay',
              id: 'tiana-install-complete',
              order: 10,
            },
            (props) => h(TianaInstallComplete, { ...props, t }),
          ),
        );

        ctx.slots.inject('conversation.session.header.actions', () =>
          ctx.slots.register(
            {
              name: 'conversation.session.header.actions',
              id: 'tiana-preview',
              order: 10,
            },
            (props) => h(TianaConversationPreview, { ...props, t }),
          ),
        );

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 12,
              locale: NS,
              label: () => t('panel'),
            },
            TianaIcon,
          ),
        );
      },
    };
  },
});
