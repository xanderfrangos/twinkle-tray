import React from "react";

export default class SafeRender extends React.Component {
    constructor(props) {
      super(props);
      this.state = { hasError: false, error: "" };
    }
  
    static getDerivedStateFromError(error) {
      return { hasError: true, error: error };
    }
  
    componentDidCatch(error, errorInfo) {
      console.log(error)
      this.setState({
          hasError: true,
          error: error,
          errorInfo: errorInfo?.componentStack
        })
    }
  
    render() {
      if (this.state.hasError) {
        return (<pre className="try-catch-failure">Error: {JSON.stringify(this.state.error)}<br />{this.state.errorInfo}</pre>);
      }
  
      return <>{this.props?.children}</>; 
    }
  }