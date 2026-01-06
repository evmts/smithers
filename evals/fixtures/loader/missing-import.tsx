import { NonExistentModule } from './does-not-exist.js'
import { Claude } from '../../../src/components/index.js'

export default (
  <Claude>
    This will fail due to missing import
  </Claude>
)
