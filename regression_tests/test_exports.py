import io
import unittest
from urllib.parse import unquote
from unittest.mock import patch
from zipfile import ZipFile
from PIL import Image
from fastapi.testclient import TestClient
import app


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app.app)

    def test_vietnamese_pptx_is_a_real_document(self):
        title = 'Cuộc họp tiếng Việt'
        response = self.client.post('/api/powerpoint', json={'title': title, 'summary': 'Nội dung thử nghiệm', 'key_points': ['Kết quả']})
        self.assertEqual(response.status_code, 200)
        self.assertIn('presentationml.presentation', response.headers['content-type'])
        disposition = response.headers['content-disposition']
        self.assertEqual(unquote(disposition.split("filename*=UTF-8''")[1]), title.replace(' ', '_') + '.pptx')
        disposition.encode('ascii')
        with ZipFile(io.BytesIO(response.content)) as document:
            self.assertIn('ppt/presentation.xml', document.namelist())
            self.assertIn(title, document.read('ppt/slides/slide1.xml').decode())

    def test_vietnamese_png_is_a_real_image(self):
        title = 'Cuộc họp tiếng Việt'
        response = self.client.post('/api/visualization', json={'title': title, 'summary': 'Nội dung thử nghiệm'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['content-type'], 'image/png')
        self.assertEqual(unquote(response.headers['content-disposition'].split("filename*=UTF-8''")[1]), title.replace(' ', '_') + '.png')
        with Image.open(io.BytesIO(response.content)) as image:
            self.assertEqual(image.format, 'PNG')
            self.assertEqual(image.size, (1280, 720))

    def test_download_headers_handle_unicode_and_control_characters(self):
        for title in ['Meeting', 'Tiếng Việt 💙', '"quoted"; tên', 'bad\r\nInjected: header', '../../meeting', '']:
            with self.subTest(title=title):
                value = app.download_disposition(title, '.pptx')
                value.encode('ascii')
                self.assertNotIn('\r', value)
                self.assertNotIn('\n', value)
                filename = unquote(value.split("filename*=UTF-8''")[1])
                self.assertNotIn('/', filename)
                self.assertNotIn('\\', filename)
                self.assertTrue(filename.endswith('.pptx'))

    def test_generation_failures_use_error_status(self):
        for route, generator in [('/api/powerpoint', 'generate_pptx'), ('/api/visualization', 'generate_image')]:
            with self.subTest(route=route), patch('app.' + generator, side_effect=RuntimeError('Synthetic export failure')):
                response = self.client.post(route, json={'title': 'Meeting', 'summary': 'Test'})
                self.assertEqual(response.status_code, 500)
                self.assertEqual(response.json()['status'], 'error')

if __name__ == '__main__':
    unittest.main()
