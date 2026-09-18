const localesZH = {
  PIC_MIGRATER_CHOOSE_FILE: '[ZH] Choose File',
  PIC_MIGRATER_CHOOSE_FOLDER: '[ZH] Choose Folder',
}

const localesEN = {
  PIC_MIGRATER_CHOOSE_FILE: 'Choose File',
  PIC_MIGRATER_CHOOSE_FOLDER: 'Choose Folder',
}

module.exports = ctx => ({
  register: () => {
    ctx.i18n.addLocale('zh-CN', localesZH)
    ctx.i18n.addLocale('en', localesEN)
  },
  config: ctx => [
    { name: 'file', message: ctx.i18n.translate('PIC_MIGRATER_CHOOSE_FILE') },
    { name: 'folder', message: ctx.i18n.translate('PIC_MIGRATER_CHOOSE_FOLDER') },
  ],
})
