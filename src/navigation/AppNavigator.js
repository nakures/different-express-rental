import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, Text } from 'react-native';

import { useAuth } from '../context/AuthContext';

import LoginScreen from '../screens/LoginScreen';
import ProformasListScreen from '../screens/ProformasListScreen';
import ProformaCreateScreen from '../screens/ProformaCreateScreen';
import ProformaDetailScreen from '../screens/ProformaDetailScreen';
import StatisticsScreen from '../screens/StatisticsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Proformas"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#9b59b6',
        tabBarInactiveTintColor: '#888',
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600', paddingBottom: 5 },
      }}
    >
      <Tab.Screen 
        name="Proformas" 
        component={ProformasListScreen} 
        options={{ tabBarLabel: 'Proformas' }}
      />
      <Tab.Screen 
        name="Statistics" 
        component={StatisticsScreen} 
        options={{ tabBarLabel: 'Statistics' }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { userToken, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f7fa' }}>
        <ActivityIndicator size="large" color="#9b59b6" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {userToken == null ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="ProformaCreate" component={ProformaCreateScreen} />
            <Stack.Screen name="ProformaDetail" component={ProformaDetailScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}