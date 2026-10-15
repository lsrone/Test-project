"""Package the self-contained app without dependencies, private settings or credentials."""
from pathlib import Path
from shutil import copyfile
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
exports = ROOT / 'exports'
release = ROOT / 'releases'
release.mkdir(exist_ok=True)
html = exports / 'Volna.html'
if not html.is_file():
    raise SystemExit('Run npm run export:html first.')

notes = '''VOLNA — музыка на твоей волне

1. Распакуй архив и открой Volna.html в современном браузере.
2. На главной выбери «Онлайн-каталог»: доступные открытые релизы загружаются с Internet Archive.
3. Открой релиз, чтобы увидеть и слушать его треки. Каталог загружается страницами.
4. Стрелка вниз рядом с разрешённым треком сохраняет полный файл на устройстве.
5. Открой «Скачанное», чтобы слушать сохранённые записи без интернета.
   На телефоне: «Коллекция» → «Скачанное». Галочка рядом с треком удаляет копию.
6. «Моя волна» автоматически ищет новые записи по настроению и вкусу.
   «Обновить волну» загружает следующую партию, не прерывая текущий трек.
   Во время прослушивания волны очередь пополняется автоматически.

Восемь демотреков встроены и доступны без сети. Онлайн-каталог требует интернет
до скачивания треков; он не содержит все существующие коммерческие записи.
Копии хранятся в браузере, а не внутри этого HTML. Перенос HTML не переносит их.
Авторы, источник и условия доступны в меню каждого импортированного трека.

YouTube — отдельная интеграция. В HTML поиск и ссылки открываются в отдельной вкладке.
В серверной версии поиск внутри приложения работает через YouTube.js без
пользовательского API-ключа, а видео воспроизводятся официальным плеером YouTube.
Скачивание видео YouTube не реализовано. Секретов в этом архиве нет.

В ограниченном предпросмотре браузер может запрещать скрипты или хранилище.
Открой HTML отдельным файлом в браузере. Если провайдер недоступен в вашей сети,
приложение покажет ошибку источника, а встроенная музыка останется доступна.
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
