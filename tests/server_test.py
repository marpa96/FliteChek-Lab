import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec=importlib.util.spec_from_file_location('server',Path(__file__).resolve().parents[1]/'scripts/serve.py')
server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
server.ACCESS_KEY='test-private-key'
class AccessTests(unittest.TestCase):
    def handler(self,path='/',cookie='',ip='192.168.1.7'):
        return SimpleNamespace(path=path,headers={'Cookie':cookie},client_address=(ip,999))
    def test_install_launch_authenticates_without_safari_cookie(self):
        manifest=server.json.loads(server.install_manifest())
        self.assertEqual(manifest['id'],'./')
        self.assertTrue(server.allowed(self.handler('/'+manifest['start_url'].removeprefix('./'))))
        self.assertEqual(manifest['scope'],'./')
    def test_remote_requires_key(self):self.assertFalse(server.allowed(self.handler()))
    def test_wrong_key_rejected(self):self.assertFalse(server.allowed(self.handler('/?access=wrong')))
    def test_private_link_accepted(self):self.assertTrue(server.allowed(self.handler('/?access=test-private-key')))
    def test_cookie_accepted(self):self.assertTrue(server.allowed(self.handler(cookie='__Host-FliteChek=test-private-key')))
    def test_local_preview(self):self.assertTrue(server.allowed(self.handler(ip='127.0.0.1')))
    def test_unusual_key_rejected(self):self.assertFalse(server.allowed(self.handler('/?access=%F0%9F%98%80')))
if __name__=='__main__':unittest.main()
