"""Package the self-contained app without dependencies, private settings or credentials."""
from pathlib import Path
from shutil import copyfile
from zipfile import ZipFile, ZIP_DEFLATED
import argparse
import hashlib
import json

arguments = argparse.ArgumentParser()
arguments.add_argument('--windows', action='store_true', help='Include the built Windows executable')
options = arguments.parse_args()

ROOT = Path(__file__).resolve().parent.parent
exports = ROOT / 'exports'
release = ROOT / 'releases'
release.mkdir(exist_ok=True)
html = exports / 'Volna.html'
if not html.is_file():
    raise SystemExit('Run npm run export:html first.')

version = json.loads((ROOT / 'package.json').read_text())['version']
notes = f'''VOLNA {version} — музыка на твоей волне

YouTube-поиск по умолчанию, страницы результатов и привязка импорта Яндекса.
YouTube открывается в обычном браузере, встроенный плеер остаётся аудио.

Windows: полностью закрой старую Volna и запусти новый EXE.
HTML: распакуй архив и открой Volna.html в современном браузере.
Восемь демотреков и все ресурсы встроены. Для аудиокаталога нужен интернет.

Основной поиск использует публичную выдачу YouTube. Записи открываются
в браузере кнопкой со стрелкой, их можно сохранить в избранное/плейлист.
Если источник не отвечает, открой поиск на YouTube или повтори запрос.
Весь индекс YouTube и доступность каждой записи не гарантируются.

«Аудиокаталог» и «Моя волна» используют Internet Archive / netlabels:
полные MP3 независимых артистов. Видео внутри приложения отсутствует.

1. Ищи музыку в верхней строке: YouTube выбран по умолчанию, выдача списком.
2. «Загрузить ещё треки» продолжает поиск. «Каталог» открывает релизы целиком.
3. Управляй аудио в нижней панели: пауза, перемотка, громкость и очередь.
4. Сердечко сохраняет в избранное, меню трека добавляет в плейлист.
   Новые добавления появляются сверху.
5. Волна учитывает выбранные в поиске записи и стили, лайки, прослушивания
   и пропуски. Обновление не прерывает музыку; очередь пополняется сама.
6. Стрелка вниз сохраняет разрешённый MP3 полностью на устройстве.
   «Скачанное» работает без сети; галочка удаляет локальную копию.
7. «Перенести библиотеку» импортирует CSV/JSON из Яндекс Музыки.
   Лупа ищет запись на YouTube; цепочка связывает выбранный результат
   с исходным треком, сохраняя лайк и плейлисты. Аудио и подписка не переносятся.

Старые YouTube- и Яндекс-записи не удаляются: остаются названия и ссылки.
Ссылки YouTube и связанные записи Яндекса открываются в браузере.
В аудиоочередь и офлайн-скачивание YouTube не добавляются.

Скачивания предлагаются только при известных CC/Public Domain условиях.
Копии хранятся в IndexedDB текущего браузера/адреса; перенос HTML не переносит
скачанную музыку. Встроенные демотреки остаются доступны без сети.

При ограничении скриптов/хранилища в предпросмотре открой HTML отдельным файлом.
Секретов в архиве нет. Доступность онлайн-записей определяет источник.
'''
(exports / 'READ-ME.txt').write_text(notes, encoding='utf-8')
copyfile(html, release / 'Volna.html')
with ZipFile(release / 'Volna.zip', 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    archive.write(html, 'Volna/Volna.html')
    archive.writestr('Volna/READ-ME.txt', notes)
with ZipFile(release / 'Volna.zip') as archive:
    assert archive.testzip() is None
    assert archive.read('Volna/Volna.html') == html.read_bytes()
for name in ['Volna.html', 'Volna.zip']:
    target = release / name
    target.chmod(0o644)
    print(f'{target.relative_to(ROOT)}: {target.stat().st_size:,} bytes')

names = ['Volna.html', 'Volna.zip']
if options.windows:
    version = json.loads((ROOT / 'package.json').read_text())['version']
    name = f'Volna-{version}-Windows-x64.exe'
    source = ROOT / 'desktop-dist' / name
    if not source.is_file():
        raise SystemExit('Build the Windows application first: npm run desktop:win')
    with source.open('rb') as executable:
        if executable.read(2) != b'MZ':
            raise SystemExit('The Windows artifact is not a PE executable.')
    copyfile(source, release / name)
    (release / name).chmod(0o644)
    names.append(name)
    print(f'releases/{name}: {source.stat().st_size:,} bytes')

checksums = []
for name in names:
    digest = hashlib.sha256()
    with (release / name).open('rb') as artifact:
        for chunk in iter(lambda: artifact.read(1024 * 1024), b''):
            digest.update(chunk)
    checksums.append(f'{digest.hexdigest()}  {name}')
(release / 'SHA256SUMS').write_text('\n'.join(checksums) + '\n')
