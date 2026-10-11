import unittest
import adoption

class AdoptionTest(unittest.TestCase):
    def test_schema_filters(self):
        p = adoption.policy({'user_id', 'is_internal'})
        self.assertIn('is_internal IS FALSE', p['exclude'])
        self.assertIn("<> 'LOADTEST'", p['include'])
        self.assertNotIn('is_internal IS FALSE', p['include'])
        self.assertIn('user_id::text', p['identity'])
        old = adoption.policy({'user_nik'})
        self.assertNotIn('is_internal', old['exclude'])
        self.assertFalse(old['ready'])
        self.assertEqual(old['exclude'], old['include'])
    def test_both_variants_and_legacy_are_truthful(self):
        calls = []
        def rows(sql):
            calls.append(sql)
            if 'information_schema.columns' in sql:
                return [{'column_name':'user_id'}, {'column_name':'is_internal'}]
            return []
        result = adoption.read_adoption(rows)
        self.assertTrue(result['ready'])
        self.assertEqual(set(result['variants']), {'exclude', 'include'})
        self.assertTrue(any('is_internal IS FALSE' in q for q in calls))
        self.assertTrue(all("LOADTEST" in q for q in calls[1:]))
        legacy = adoption.read_adoption(lambda q: [])
        self.assertFalse(legacy['ready'])
        self.assertIn('unavailable', legacy['notice'])

if __name__ == '__main__': unittest.main()
