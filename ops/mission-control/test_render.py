import datetime
import re
import unittest
import render_base

class RendererTest(unittest.TestCase):
    def fixture(self, ready=True):
        now = datetime.datetime(2026,10,11,tzinfo=datetime.timezone.utc)
        variants = {mode:{'kpi':{'d7':q,'users7':u},'users':[{'k':name,'n':q}], 'unknown7':3} for mode,q,u,name in [('exclude',5,2,'External fixture'),('include',9,3,'Internal fixture')]}
        st = {'fields':{'adoption':{'value':{'ready':ready,'notice':'Internal classification unavailable' if not ready else 'Classified adoption', 'variants':variants},'retrieved_at':now.isoformat()},'usage':{'value':{'kpi':{'d7':99,'cost_mtd':1234}}}}}
        return st,now
    def test_base_uses_filtered_identity_not_operational_query_count(self):
        st,now=self.fixture()
        page=render_base.render(st,now,[],{})
        self.assertRegex(page,r'(?s)Queries \(7 days\).*?st-v">5</div>')
        self.assertIn('External fixture',page)
        self.assertNotIn('Internal fixture',page)
        self.assertIn('1,234',page)
    def test_toggle_is_explicit_and_default_off(self):
        import render
        st,now=self.fixture()
        page=render.render(st,now,[],{})
        self.assertIn('id="include-internal"',page)
        self.assertIn('data-adoption-view="include" hidden',page)
        self.assertNotIn('type="checkbox" checked',page)
        self.assertIn('Internal fixture',page)
        ids=re.findall(r'\bid="([^"]+)"',page)
        self.assertEqual(len(ids),len(set(ids)))
    def test_legacy_disabled_and_labeled(self):
        import render
        st,now=self.fixture(False)
        page=render.render(st,now,[],{})
        self.assertIn('id="include-internal" type="checkbox" disabled',page)
        self.assertIn('unavailable',page)

if __name__ == '__main__':unittest.main()
