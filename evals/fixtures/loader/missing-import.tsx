import { NonExistentModule } from './does-not-exist.js'
import { Claude } from '@evmts/smithers'

export default (
  <Claude>
    This will fail due to missing import
  </Claude>
)
