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

Windows: полностью закрой старую Volna и запусти новый EXE.
По запросу возвращён плеер YouTube из 1.1.2, объединённый с новой библиотекой.
Видео видно внутри нижней панели. Пауза, громкость, перемотка, очередь,
повтор, лайки и плейлисты управляются из Volna. Переход в браузер — только явно.

TXT/TSV/CSV/JSON импортируются на устройстве. Формат TXT: Исполнитель - Название.
Нажатие на импортированный трек ищет точное совпадение на YouTube.
Если совпадение не найдено, выбери запись вручную и нажми цепочку.
ID трека, исходное название, лайк и плейлисты сохраняются. Повторный импорт
сохраняет привязку. Весь личный список при поиске одного трека не отправляется.
Личный список пользователя не включён в EXE, HTML и репозиторий.

Некоторые авторы запрещают встраивание, записи бывают удалены или ограничены.
Работа всех треков не гарантируется. Кнопка «Другая запись» позволяет выбрать
альтернативу с сохранением состава коллекции. Потоки YouTube не извлекаются,
скачивание и обход ограничений YouTube не выполняются.

Свои MP3/M4A/OGG/WAV/FLAC до 250 МБ можно прикрепить через меню трека.
Файл остаётся на устройстве и воспроизводится без интернета. Локальный файл
имеет приоритет над YouTube. Сам TXT переносит список, а не аудиофайлы.

«Аудиокаталог» и «Моя волна» используют полные MP3 Internet Archive / netlabels.
Волна учитывает избранное, выбор в поиске и реальные прослушивания; новые записи
пополняют очередь. Синие частицы движутся во время воспроизведения.
Новые лайки и добавления в плейлисты появляются сверху. Вымышленного профиля нет.

Стрелка вниз сохраняет только разрешённые CC/Public Domain MP3 в IndexedDB.
Скачанное привязано к устройству/адресу приложения. Перенос HTML не переносит
скачанную музыку. Восемь оригинальных демотреков встроены и работают без сети.

HTML: распакуй ZIP и открой Volna.html. Встроенные ресурсы автономны;
YouTube-плеер доступен в EXE и серверной версии Volna.
Сборка без цифровой подписи. Доступность онлайн-записей определяет источник.
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
