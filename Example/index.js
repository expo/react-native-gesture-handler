import { AppRegistry, Platform } from 'react-native';

import ExampleApp from './App';

AppRegistry.registerComponent('App', () => ExampleApp);

if (Platform.OS === 'web') {
  AppRegistry.runApplication('App', {
    rootTag: document.getElementById('root'),
  });
}
